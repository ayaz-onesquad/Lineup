// Supabase Edge Function: website-lead-intake
//
// Receives free mock-up requests from a tenant's public website (first: theonesquad.com, the
// OneSquad tenant) and files each one as a Lead with its Contact, so it shows up in LineUp's
// Leads view like any other lead.
//
// Deploy:
//   npx supabase functions deploy website-lead-intake --no-verify-jwt
//
// Secrets (Supabase Dashboard > Edge Functions > website-lead-intake > Secrets):
//   INTAKE_SECRET     A long random string. The website sends it as `x-intake-secret`.
//   INTAKE_TENANT_ID  The tenant every lead from this intake is filed under (OneSquad).
//   INTAKE_USER_ID    The user recorded as creator of the lead and contact
//                     (contacts.created_by is required). Use a real team member or a
//                     dedicated "Website" user in that tenant.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Auto-provided.
//
// SECURITY
//   - Server-to-server only: the website's server calls this, never a browser. Every request
//     must carry INTAKE_SECRET (compared in constant time). Without it the function refuses.
//   - The tenant and the creating user come from this function's own secrets, never from the
//     request body, so a caller can only ever add leads to the configured tenant.
//   - Input is validated and length-limited here again; text that lands in rich-text fields is
//     HTML-escaped.
//   - Best-effort rate limit per instance (30 a minute).
//   - Leads created here carry source_automation_name = INTAKE_MARKER, which
//     send-waitlist-welcome skips, so website leads never get the LineUp waitlist email.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { AuthError, checkRateLimit, createServiceClient, errorResponse, escapeHtml, isValidEmail, jsonResponse } from '../_shared/security.ts'

export const INTAKE_MARKER = 'Website form'

interface IntakePayload {
  first_name: string
  last_name?: string
  business: string
  email: string
  phone?: string
  needs?: string[]
  message?: string
  estimate?: string
  /** "Friday, October 23": when the free mock-up is due, worked out by the website */
  mockup_due?: string
  /** Where the request came from, e.g. "theonesquad.com" */
  site?: string
}

const LIMITS = { name: 80, business: 255, email: 254, phone: 30, need: 60, needs: 12, message: 2000, estimate: 3000, short: 120 }

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  const length = Math.max(x.length, y.length)
  let mismatch = x.length === y.length ? 0 : 1
  for (let i = 0; i < length; i++) mismatch |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return mismatch === 0
}

function requireIntakeSecret(req: Request): void {
  const expected = Deno.env.get('INTAKE_SECRET')
  if (!expected) throw new AuthError('Intake is not configured', 503)
  const provided = req.headers.get('x-intake-secret')
  if (!provided || !timingSafeEqual(provided, expected)) throw new AuthError('Unauthorized', 401)
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Validates and trims the body. Throws a 400 with a plain reason when it isn't usable. */
function readPayload(body: unknown): Required<IntakePayload> {
  if (!body || typeof body !== 'object') throw new AuthError('Body must be a JSON object', 400)
  const b = body as Record<string, unknown>
  const p = {
    first_name: str(b.first_name, LIMITS.name),
    last_name: str(b.last_name, LIMITS.name),
    business: str(b.business, LIMITS.business),
    email: str(b.email, LIMITS.email).toLowerCase(),
    phone: str(b.phone, LIMITS.phone),
    needs: Array.isArray(b.needs) ? b.needs.slice(0, LIMITS.needs).map((n) => str(n, LIMITS.need)).filter(Boolean) : [],
    message: str(b.message, LIMITS.message),
    estimate: str(b.estimate, LIMITS.estimate),
    mockup_due: str(b.mockup_due, LIMITS.short),
    site: str(b.site, LIMITS.short),
  }
  if (!p.first_name) throw new AuthError('first_name is required', 400)
  if (!p.business) throw new AuthError('business is required', 400)
  if (!p.email || !isValidEmail(p.email)) throw new AuthError('A valid email is required', 400)
  return p
}

/** Plain text to the small HTML the rich-text fields expect: escaped, one paragraph per line. */
const paragraphs = (text: string) =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')

serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  try {
    requireIntakeSecret(req)
    checkRateLimit('website-lead-intake', 30, 60_000)

    const tenantId = Deno.env.get('INTAKE_TENANT_ID')
    const userId = Deno.env.get('INTAKE_USER_ID')
    if (!tenantId || !userId) throw new AuthError('Intake is not configured', 503)

    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new AuthError('Body must be JSON', 400)
    }
    const p = readPayload(body)
    const supabase = createServiceClient()

    const notes = [
      p.needs.length ? `What they need: ${p.needs.join(', ')}` : '',
      p.mockup_due ? `Free mock-up due: ${p.mockup_due}` : '',
      p.estimate ? `Estimate from the calculator:\n${p.estimate}` : '',
      `Sent from the website form${p.site ? ` on ${p.site}` : ''}.`,
    ]
      .filter(Boolean)
      .join('\n')

    // 1. The lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        lead_name: p.business,
        email: p.email,
        phone: p.phone || null,
        website: null,
        source: 'website',
        status: 'new',
        description: p.message ? paragraphs(p.message) : null,
        notes: paragraphs(notes),
        source_automation_name: INTAKE_MARKER,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (leadError || !lead) {
      console.error('[website-lead-intake] lead insert failed', leadError)
      throw new Error('Lead insert failed')
    }

    // 2. The person, linked to the lead as its primary contact. A failure here keeps the lead
    //    (it already has the email and phone) and is reported in the response.
    let contactLinked = false
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        tenant_id: tenantId,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        phone: p.phone || null,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (contactError || !contact) {
      console.error('[website-lead-intake] contact insert failed', contactError)
    } else {
      const { error: linkError } = await supabase.from('lead_contacts').insert({
        tenant_id: tenantId,
        lead_id: lead.id,
        contact_id: contact.id,
        is_primary: true,
        is_decision_maker: true,
        created_by: userId,
        updated_by: userId,
      })
      if (linkError) console.error('[website-lead-intake] lead_contacts insert failed', linkError)
      else contactLinked = true
    }

    return jsonResponse(req, { lead_id: lead.id, contact_linked: contactLinked }, 201)
  } catch (err) {
    return errorResponse(req, err)
  }
})
