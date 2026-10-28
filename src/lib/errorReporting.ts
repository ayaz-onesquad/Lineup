import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useTenantStore } from '@/stores/tenantStore'

/**
 * Application error reporting.
 *
 * Every error is written to LineUp's own error log (`log_app_error`, migration
 * 073), which is the system of record that SysAdmins review and close out in
 * Admin > Errors. When `VITE_SENTRY_DSN` is set the same errors also go to
 * Sentry, for stack-trace debugging and alerting; without it Sentry is never
 * loaded.
 *
 * Sources wired in: window errors and unhandled rejections (here), the React
 * error boundary, and every failed TanStack Query query or mutation, which is
 * where Supabase / RLS errors surface.
 */

declare const __APP_RELEASE__: string

type ErrorSource = 'client' | 'api'

interface ReportOptions {
  /** 'api' for failed Supabase / network calls, 'client' for code errors. */
  source?: ErrorSource
  /** Extra detail stored with the occurrence (component stack, query key). */
  context?: Record<string, unknown>
}

interface NormalizedError {
  name: string
  message: string
  code?: string
  stack?: string
  details?: unknown
  hint?: unknown
}

const RELEASE = typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : 'dev'
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

// Per page load: at most 5 reports of the same error and 30 in total, so an
// error inside a render loop cannot flood the log.
const MAX_PER_FINGERPRINT = 5
const MAX_PER_PAGE = 30
const sentCounts = new Map<string, number>()
let sentTotal = 0

// Browser noise that is not actionable.
const IGNORED = [/ResizeObserver loop/i, /^AbortError/i, /The user aborted a request/i]

let sentry: typeof import('@sentry/react') | null = null

// Messages reported in the last few seconds, so an error toast that shows the
// same text as a failed query or mutation is not logged a second time.
const RECENT_WINDOW_MS = 10_000
const recentMessages = new Map<string, number>()

/** Turns anything thrown (Error, Supabase error object, string) into one shape. */
function normalize(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const extra = error as Error & { code?: string; details?: unknown; hint?: unknown }
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      code: extra.code,
      stack: error.stack,
      details: extra.details,
      hint: extra.hint,
    }
  }
  if (error && typeof error === 'object') {
    // PostgrestError and friends are plain objects with message/code/details/hint.
    const obj = error as Record<string, unknown>
    return {
      name: typeof obj.name === 'string' ? obj.name : 'SupabaseError',
      message: typeof obj.message === 'string' ? obj.message : JSON.stringify(obj).slice(0, 500),
      code: typeof obj.code === 'string' ? obj.code : undefined,
      details: obj.details,
      hint: obj.hint,
    }
  }
  return { name: 'Error', message: String(error) }
}

/**
 * Groups the same error together: ids, numbers and quoted values are masked so
 * "row 123 not found" and "row 456 not found" are one group.
 */
function fingerprintOf(source: string, err: NormalizedError) {
  const message = err.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/"[^"]*"|'[^']*'/g, '<str>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300)
  // First stack frame inside our own code, without line numbers that change per build.
  const frame = (err.stack ?? '')
    .split('\n')
    .find((line) => line.includes('/src/') || line.includes('/assets/'))
    ?.replace(/:\d+:\d+\)?$/, '')
    .replace(/-[A-Za-z0-9_]{8}\.js/, '.js')
    .trim() ?? ''
  const input = [source, err.name, err.code ?? '', message, frame].join('|')
  // FNV-1a, 2 x 32 bits: stable, dependency-free, collisions irrelevant here.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0
  }
  return `${source}-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

export function reportError(error: unknown, options: ReportOptions = {}) {
  try {
    const err = normalize(error)
    if (IGNORED.some((re) => re.test(`${err.name}: ${err.message}`))) return

    recentMessages.set(err.message, Date.now())

    const source: ErrorSource = options.source ?? (err.code || err.details ? 'api' : 'client')
    const fingerprint = fingerprintOf(source, err)
    const count = sentCounts.get(fingerprint) ?? 0
    if (count >= MAX_PER_FINGERPRINT || sentTotal >= MAX_PER_PAGE) return
    sentCounts.set(fingerprint, count + 1)
    sentTotal++

    const userId = useAuthStore.getState().user?.id
    const tenantId = useTenantStore.getState().currentTenant?.id
    const context = {
      ...options.context,
      ...(err.details !== undefined && { details: err.details }),
      ...(err.hint !== undefined && { hint: err.hint }),
    }

    if (import.meta.env.DEV) {
      console.error('[errorReporting]', err.message, { fingerprint, context, error })
    }

    // Fire and forget. A failure to log is swallowed: reporting it would loop.
    void supabase
      .rpc('log_app_error', {
        p_fingerprint: fingerprint,
        p_message: err.message,
        p_error_name: err.name,
        p_code: err.code ?? null,
        p_stack: err.stack ?? null,
        p_source: source,
        p_url: window.location.href,
        p_tenant_id: tenantId ?? null,
        p_release: RELEASE,
        p_user_agent: navigator.userAgent,
        p_context: context,
      })
      .then(
        () => undefined,
        () => undefined
      )

    if (sentry) {
      sentry.withScope((scope) => {
        scope.setFingerprint([fingerprint])
        scope.setTag('source', source)
        if (tenantId) scope.setTag('tenant_id', tenantId)
        if (userId) scope.setUser({ id: userId })
        scope.setContext('lineup', context)
        sentry!.captureException(error instanceof Error ? error : new Error(err.message))
      })
    }
  } catch {
    // Never let error reporting itself throw.
  }
}

/**
 * Logs an error toast the user saw. Most already came from a failed query or
 * mutation that was reported; those are skipped so each error is logged once.
 */
export function reportToastError(title: string, description: string) {
  const message = description || title
  if (!message) return
  const now = Date.now()
  for (const [seen, at] of recentMessages) {
    if (now - at > RECENT_WINDOW_MS) recentMessages.delete(seen)
    // Toasts often wrap the error text ("Failed to save: <message>").
    else if (seen && message.includes(seen)) return
  }
  const error = new Error(message)
  error.name = title || 'Error'
  error.stack = undefined
  reportError(error, { source: 'client', context: { kind: 'toast', title } })
}

/** Call once at startup, before rendering. */
export function initErrorReporting() {
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, {
      context: { kind: 'window.onerror', filename: event.filename, line: event.lineno },
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { context: { kind: 'unhandledrejection' } })
  })

  if (SENTRY_DSN) {
    // Loaded only when configured, so it costs nothing otherwise.
    void import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        release: RELEASE,
        // Errors only; no performance tracing or session replay.
        tracesSampleRate: 0,
        // Our own window listeners above already forward these through
        // reportError; Sentry's would send every one twice.
        integrations: (defaults) => defaults.filter((i) => i.name !== 'GlobalHandlers'),
      })
      sentry = Sentry
    })
  }
}
