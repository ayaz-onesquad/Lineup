/**
 * Session policy primitives.
 *
 * Before this module the app relied solely on Supabase's `autoRefreshToken`
 * with `persistSession` against localStorage, which meant a signed-in browser
 * stayed signed in indefinitely. Two independent limits are now enforced:
 *
 *   1. IDLE TIMEOUT      — no user interaction for N minutes ends the session.
 *   2. ABSOLUTE LIFETIME — a session is force-ended N hours after sign-in,
 *                          regardless of activity.
 *
 * Both limits are coordinated across browser tabs through localStorage, so
 * activity in one tab keeps the others alive and a timeout in one tab ends the
 * session everywhere.
 *
 * The limits themselves are tenant-configurable (see migration 068 and
 * `get_effective_session_policy`); the values here are the fallbacks used
 * before the policy has loaded.
 */

import type { EffectiveSessionPolicy } from '@/types/database'

// ---------------------------------------------------------------------------
// Storage keys — deliberately NOT prefixed `sb-` so they are never confused
// with Supabase's own token entries.
// ---------------------------------------------------------------------------
export const SESSION_KEYS = {
  /** Epoch ms at which the current session began. Drives the absolute cap. */
  startedAt: 'lineup:session:started-at',
  /** Epoch ms of the most recent user interaction in ANY tab. */
  lastActivity: 'lineup:session:last-activity',
  /** '1' when the user ticked "Keep me signed in on this device". */
  trustedDevice: 'lineup:session:trusted-device',
  /** Why the last sign-out happened, read once by the login page. */
  logoutReason: 'lineup:session:logout-reason',
} as const

export const DEFAULT_SESSION_POLICY: EffectiveSessionPolicy = {
  idle_timeout_minutes: 30,
  absolute_session_hours: 12,
  warn_before_logout_seconds: 60,
  allow_remember_device: true,
  remember_device_days: 14,
  block_document_download: false,
  signed_url_ttl_seconds: 120,
}

export type LogoutReason =
  | 'idle_timeout'
  | 'absolute_timeout'
  | 'manual'
  | 'session_invalid'

export const LOGOUT_REASON_MESSAGES: Record<LogoutReason, string> = {
  idle_timeout: 'You were signed out because of inactivity.',
  absolute_timeout: 'Your session reached its maximum length. Please sign in again.',
  manual: 'You have been signed out.',
  session_invalid: 'Your session is no longer valid. Please sign in again.',
}

// ---------------------------------------------------------------------------
// Safe storage access — localStorage throws in private mode / blocked cookies
// ---------------------------------------------------------------------------
function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — timeouts fall back to in-memory tracking */
  }
}

function clearKey(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function readTimestamp(key: string): number | null {
  const raw = readKey(key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

// ---------------------------------------------------------------------------
// Session lifecycle markers
// ---------------------------------------------------------------------------

/** Called on sign-in. Starts both the idle clock and the absolute clock. */
export function markSessionStart(now: number = Date.now()): void {
  writeKey(SESSION_KEYS.startedAt, String(now))
  writeKey(SESSION_KEYS.lastActivity, String(now))
}

/**
 * Called on sign-in for an existing session that has no start marker yet
 * (e.g. a session created before this feature shipped). Without this, a
 * pre-existing session would have no absolute cap at all.
 */
export function ensureSessionStart(now: number = Date.now()): void {
  if (readTimestamp(SESSION_KEYS.startedAt) === null) {
    markSessionStart(now)
  }
}

export function getSessionStartedAt(): number | null {
  return readTimestamp(SESSION_KEYS.startedAt)
}

export function recordActivity(now: number = Date.now()): void {
  writeKey(SESSION_KEYS.lastActivity, String(now))
}

export function getLastActivity(): number | null {
  return readTimestamp(SESSION_KEYS.lastActivity)
}

export function clearSessionMarkers(): void {
  clearKey(SESSION_KEYS.startedAt)
  clearKey(SESSION_KEYS.lastActivity)
}

// ---------------------------------------------------------------------------
// Trusted device ("Keep me signed in")
// ---------------------------------------------------------------------------
export function setTrustedDevice(trusted: boolean): void {
  if (trusted) writeKey(SESSION_KEYS.trustedDevice, '1')
  else clearKey(SESSION_KEYS.trustedDevice)
}

export function isTrustedDevice(): boolean {
  return readKey(SESSION_KEYS.trustedDevice) === '1'
}

// ---------------------------------------------------------------------------
// Logout reason hand-off to the login screen
// ---------------------------------------------------------------------------
export function setLogoutReason(reason: LogoutReason): void {
  writeKey(SESSION_KEYS.logoutReason, reason)
}

/** Reads and clears the reason, so the message shows exactly once. */
export function consumeLogoutReason(): LogoutReason | null {
  const raw = readKey(SESSION_KEYS.logoutReason)
  clearKey(SESSION_KEYS.logoutReason)
  if (!raw) return null
  return raw in LOGOUT_REASON_MESSAGES ? (raw as LogoutReason) : null
}

// ---------------------------------------------------------------------------
// Limit arithmetic
// ---------------------------------------------------------------------------

/**
 * The absolute session cap in ms. A trusted device gets `remember_device_days`
 * instead of `absolute_session_hours`, but only if the tenant allows it.
 */
export function getAbsoluteLifetimeMs(policy: EffectiveSessionPolicy): number {
  const trusted = policy.allow_remember_device && isTrustedDevice()
  return trusted
    ? policy.remember_device_days * 24 * 60 * 60 * 1000
    : policy.absolute_session_hours * 60 * 60 * 1000
}

export function getIdleTimeoutMs(policy: EffectiveSessionPolicy): number {
  return policy.idle_timeout_minutes * 60 * 1000
}

export interface SessionDeadlines {
  /** Epoch ms at which the idle timeout fires. */
  idleExpiresAt: number
  /** Epoch ms at which the absolute cap fires, or null if no start marker. */
  absoluteExpiresAt: number | null
  /** The earlier of the two. */
  expiresAt: number
  /** Which limit will fire first. */
  reason: LogoutReason
}

/**
 * Computes the live deadlines from the stored markers. Pure apart from the
 * storage reads, so the caller can poll it cheaply.
 */
export function computeDeadlines(
  policy: EffectiveSessionPolicy,
  now: number = Date.now()
): SessionDeadlines {
  const lastActivity = getLastActivity() ?? now
  const startedAt = getSessionStartedAt()

  const idleExpiresAt = lastActivity + getIdleTimeoutMs(policy)
  const absoluteExpiresAt =
    startedAt === null ? null : startedAt + getAbsoluteLifetimeMs(policy)

  if (absoluteExpiresAt !== null && absoluteExpiresAt <= idleExpiresAt) {
    return {
      idleExpiresAt,
      absoluteExpiresAt,
      expiresAt: absoluteExpiresAt,
      reason: 'absolute_timeout',
    }
  }

  return {
    idleExpiresAt,
    absoluteExpiresAt,
    expiresAt: idleExpiresAt,
    reason: 'idle_timeout',
  }
}

/** Formats a millisecond remainder as `m:ss` for the countdown dialog. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
