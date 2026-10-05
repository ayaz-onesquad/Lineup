// Shared security helpers for LineUp Edge Functions.
//
// Several functions ran with the service_role key and no authorization check at
// all, which made them callable by anyone holding the public anon key. Every
// function should now begin with one of the guards in this module.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Origins permitted to call these functions from a browser.
 *
 * Set ALLOWED_ORIGINS in the function's environment as a comma-separated list,
 * e.g. "https://app.lineup.com,https://lineup.vercel.app". Preview deployments
 * on *.vercel.app are matched by suffix when ALLOW_VERCEL_PREVIEWS is "true".
 */
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false

  const allowed = allowedOrigins()

  // No allowlist configured: fall back to permissive behaviour so a missing env
  // var cannot take production down, but log it loudly.
  if (allowed.length === 0) {
    console.warn(
      '[security] ALLOWED_ORIGINS is not set. Falling back to allowing all origins. ' +
        'Set it to your app domains to lock this down.'
    )
    return true
  }

  if (allowed.includes(origin)) return true

  if (Deno.env.get('ALLOW_VERCEL_PREVIEWS') === 'true') {
    try {
      const host = new URL(origin).hostname
      if (host.endsWith('.vercel.app')) return true
    } catch {
      return false
    }
  }

  return false
}

/**
 * CORS headers echoing the caller's origin only when it is allowlisted.
 * A wildcard is only used when no allowlist is configured.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allowed = allowedOrigins()

  const allowOrigin =
    allowed.length === 0 ? '*' : isOriginAllowed(origin) ? (origin as string) : allowed[0]

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export function preflightResponse(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * A client acting AS THE CALLER. Every query through it is subject to RLS,
 * which is what makes tenant isolation hold inside an Edge Function.
 */
export function createUserClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}

/**
 * A client that bypasses RLS. Only use it AFTER the caller has been
 * authenticated and authorised, and never with a tenant_id taken from the
 * request body.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// ---------------------------------------------------------------------------
// Authentication / authorization
// ---------------------------------------------------------------------------

export interface AuthContext {
  userId: string
  email: string | null
  userClient: SupabaseClient
  authHeader: string
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/**
 * Verifies the bearer token and returns the caller's identity.
 * Throws AuthError, which the caller should turn into a 401/403.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header', 401)
  }

  const userClient = createUserClient(authHeader)
  const { data, error } = await userClient.auth.getUser()

  if (error || !data.user) {
    throw new AuthError('Invalid or expired session', 401)
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    userClient,
    authHeader,
  }
}

/**
 * Confirms the caller is an active member of `tenantId`, optionally with one of
 * `roles`. Resolving the tenant from membership (rather than trusting a body
 * field) is what stops a caller acting on another tenant's data.
 */
export async function requireTenantMembership(
  ctx: AuthContext,
  tenantId: string,
  roles?: string[]
): Promise<string> {
  const { data, error } = await ctx.userClient
    .from('tenant_users')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    throw new AuthError(`Could not verify tenant membership: ${error.message}`, 403)
  }
  if (!data) {
    throw new AuthError('You are not a member of that tenant', 403)
  }
  if (roles && !roles.includes(data.role)) {
    throw new AuthError(
      `This action requires one of: ${roles.join(', ')}`,
      403
    )
  }

  return data.role as string
}

/** The tenants the caller actively belongs to. */
export async function getCallerTenantIds(ctx: AuthContext): Promise<string[]> {
  const { data, error } = await ctx.userClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', ctx.userId)
    .eq('status', 'active')

  if (error) throw new AuthError(`Could not resolve tenants: ${error.message}`, 403)
  return (data ?? []).map((r) => r.tenant_id as string)
}

// ---------------------------------------------------------------------------
// Webhook authentication
// ---------------------------------------------------------------------------

/** Constant-time string compare, so a secret cannot be recovered by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)

  // Compare a fixed number of bytes regardless of length.
  const length = Math.max(aBytes.length, bBytes.length)
  let mismatch = aBytes.length === bBytes.length ? 0 : 1
  for (let i = 0; i < length; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  }
  return mismatch === 0
}

/**
 * True when the caller presented the project's service_role key as its bearer
 * token. Only server-side code holds that key, so a match is itself proof of a
 * trusted internal caller.
 *
 * The comparison is against the key this function already has in its own
 * environment, so it does not depend on the platform's `verify_jwt` setting
 * being enabled (several of these functions are deployed with
 * `--no-verify-jwt`).
 *
 * This is what lets the database notification triggers keep working: pg_net
 * sends `Authorization: Bearer <service_role_key>`, which no browser client
 * ever has. The public anon key does NOT match.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) return false

  const header = req.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false

  return timingSafeEqual(header.slice('Bearer '.length).trim(), serviceKey)
}

/**
 * True when the caller presented the configured shared webhook secret.
 * Returns false (rather than throwing) when no secret is configured, so a
 * caller can fall through to another accepted credential.
 */
export function hasValidWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('WEBHOOK_SECRET')
  if (!expected) return false

  const provided = req.headers.get('x-webhook-secret')
  if (!provided) return false

  return timingSafeEqual(provided, expected)
}

/**
 * Verifies a shared-secret webhook header. Used by functions invoked by a
 * database trigger or an external service rather than by a signed-in user.
 *
 * Set WEBHOOK_SECRET in the function's environment and send it as
 * `x-webhook-secret`. Without this, the endpoint is an open email relay.
 */
export function requireWebhookSecret(req: Request): void {
  const expected = Deno.env.get('WEBHOOK_SECRET')

  if (!expected) {
    throw new AuthError(
      'WEBHOOK_SECRET is not configured for this function. Refusing to run unauthenticated.',
      503
    )
  }

  if (!hasValidWebhookSecret(req)) {
    throw new AuthError('Invalid webhook secret', 401)
  }
}

/**
 * Accepts a trusted internal caller (service_role bearer or shared webhook
 * secret) OR an end user who is an active member of `tenantId`.
 *
 * Returns null for the trusted-internal case and the AuthContext for a user,
 * so the caller can apply different rate limits to each.
 */
export async function requireInternalOrTenantMember(
  req: Request,
  tenantId: string,
  roles?: string[]
): Promise<AuthContext | null> {
  if (isServiceRoleCaller(req) || hasValidWebhookSecret(req)) {
    return null
  }

  const ctx = await requireUser(req)
  await requireTenantMembership(ctx, tenantId, roles)
  return ctx
}

// ---------------------------------------------------------------------------
// Output encoding
// ---------------------------------------------------------------------------

/**
 * Escapes a value before it is interpolated into an HTML email body.
 *
 * Notification template variables arrive from the request body and were
 * previously substituted into `html_body` verbatim, so a caller could inject
 * arbitrary markup (including a phishing form or a tracking pixel) into an
 * email sent from the tenant's own domain.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escapes every value in a template-variable map. */
export function escapeHtmlValues(
  variables: Record<string, unknown> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(variables ?? {})) {
    out[key] = escapeHtml(value)
  }
  return out
}

/** Minimal email-shape check, to avoid relaying to malformed addresses. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254
}

// ---------------------------------------------------------------------------
// Rate limiting (per function instance)
// ---------------------------------------------------------------------------

const rateBuckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Best-effort in-memory rate limit, keyed by caller.
 *
 * Edge Function instances are ephemeral and horizontally scaled, so this is a
 * speed bump rather than a guarantee. It is still worth having on functions
 * that send email or spend third-party credits.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): void {
  const now = Date.now()
  const bucket = rateBuckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  bucket.count += 1
  if (bucket.count > maxRequests) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000)
    throw new AuthError(`Too many requests. Try again in ${seconds} seconds.`, 429)
  }
}

/** Turns an AuthError (or anything else) into a JSON response. */
export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof AuthError) {
    return jsonResponse(req, { error: err.message }, err.status)
  }
  console.error('[security] Unhandled error:', err)
  // Never leak internal error text to an unauthenticated caller.
  return jsonResponse(req, { error: 'Internal server error' }, 500)
}
