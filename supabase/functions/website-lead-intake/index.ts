// Supabase Edge Function: website-lead-intake
//
// Receives requests from a tenant's public website (first: theonesquad.com, the OneSquad tenant)
// and files each one in LineUp (v3):
//   - a Lead with its primary Contact. The lead's notes are rich text (one labelled paragraph
//     per fact); its description is the visitor's message, sanitized rich text when the website
//     sends `message_format: "html"`, plain text otherwise
//   - for a free mock-up request, a Task on that lead (plain-text description), assigned to the
//     tenant's chosen mock-up assignee (Settings > Leads, table lead_intake_settings) or else
//     INTAKE_USER_ID's profile, due one business day before the mock-up is (assigning it fires
//     LineUp's task.assigned email)
//   - a `lead.website` notification email to the tenant's chosen recipients (Settings > Leads:
//     team members' login emails plus extra addresses, de-duplicated), or to INTAKE_NOTIFY_TO
//     when nothing is set there
//
// Deploy:
//   npx supabase functions deploy website-lead-intake --no-verify-jwt
//
// Secrets (Supabase Dashboard > Edge Functions > website-lead-intake > Secrets):
//   INTAKE_SECRET     A long random string. The website sends it as `x-intake-secret`.
//   INTAKE_TENANT_ID  The tenant every request is filed under (OneSquad).
//   INTAKE_USER_ID    The login (auth) id of the user recorded as creator; their profile owns the
//                     lead and is assigned the mock-up task unless Settings > Leads names someone.
//   INTAKE_NOTIFY_TO  Fallback for who gets the new-request email (one address or a
//                     comma-separated list), used when Settings > Leads has no recipients.
//   INTAKE_APP_URL    LineUp's address for links in the email (default https://www.lineupco.io).
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Auto-provided.
//
// SECURITY
//   - Server-to-server only, behind INTAKE_SECRET (constant-time compare).
//   - The tenant, the creating user and the email recipients come from this function's own
//     secrets and the tenant's settings, never from the request body.
//   - Input is validated and length-limited again. A rich-text message is rebuilt from a small
//     allowlist (richText.ts: p, br, strong, b, em, i, u, ul, ol, li, no attributes); every other
//     value is escaped before it goes into the notes HTML. LineUp sanitizes rich text again when
//     it renders it. The email gets plain text, and send-notification escapes every variable.
//   - Best-effort rate limit per instance (30 a minute).
//   - Leads carry source_automation_name = INTAKE_MARKER, which send-waitlist-welcome skips.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { AuthError, checkRateLimit, createServiceClient, errorResponse, isValidEmail, jsonResponse } from '../_shared/security.ts'
import { htmlToPlainText, labeledLine, plainTextToHtml, sanitizeMessageHtml, escapeHtml } from './richText.ts'

export const INTAKE_MARKER = 'Website form'

type Kind = 'mockup' | 'question'

// message: visible characters; messageHtml: the raw rich-text body before sanitizing
const LIMITS = { name: 80, business: 255, email: 254, phone: 30, need: 60, needs: 12, message: 2000, messageHtml: 20000, estimate: 3000, short: 120 }

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
const isoDate = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

/** Validates and trims the body. Throws a 400 with a plain reason when it isn't usable. */
function readPayload(body: unknown) {
  if (!body || typeof body !== 'object') throw new AuthError('Body must be a JSON object', 400)
  const b = body as Record<string, unknown>
  const kind: Kind = b.kind === 'question' ? 'question' : 'mockup'
  const value = typeof b.estimate_value === 'number' && Number.isFinite(b.estimate_value) && b.estimate_value >= 0 ? Math.round(b.estimate_value) : null

  // The message: rich text when the website says so, plain text otherwise (as before v3).
  // message_html is the sanitized rich text (or the plain text as paragraphs); message is the
  // plain-text version for the email and the task.
  let messageHtml = ''
  let message = ''
  if (b.message_format === 'html') {
    messageHtml = sanitizeMessageHtml(typeof b.message === 'string' ? b.message.slice(0, LIMITS.messageHtml) : '', LIMITS.message)
    message = htmlToPlainText(messageHtml)
  } else {
    message = str(b.message, LIMITS.message)
    messageHtml = plainTextToHtml(message)
  }

  const p = {
    kind,
    first_name: str(b.first_name, LIMITS.name),
    last_name: str(b.last_name, LIMITS.name),
    business: str(b.business, LIMITS.business),
    email: str(b.email, LIMITS.email).toLowerCase(),
    phone: str(b.phone, LIMITS.phone),
    needs: Array.isArray(b.needs) ? b.needs.slice(0, LIMITS.needs).map((n) => str(n, LIMITS.need)).filter(Boolean) : [],
    message,
    message_html: messageHtml,
    estimate: str(b.estimate, LIMITS.estimate),
    estimate_value: value,
    mockup_due: str(b.mockup_due, LIMITS.short),
    mockup_due_date: isoDate(b.mockup_due_date),
    site: str(b.site, LIMITS.short),
  }
  if (!p.first_name) throw new AuthError('first_name is required', 400)
  if (!p.email || !isValidEmail(p.email)) throw new AuthError('A valid email is required', 400)
  if (kind === 'mockup' && !p.business) throw new AuthError('business is required for a mock-up request', 400)
  if (kind === 'question' && !p.message) throw new AuthError('message is required for a question', 400)
  return p
}

/** The business day before an ISO date (Friday before a Monday). */
function businessDayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  do d.setUTCDate(d.getUTCDate() - 1)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return d.toISOString().slice(0, 10)
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

type ServiceClient = ReturnType<typeof createServiceClient>

interface IntakeSettings {
  notify_user_ids: string[]
  notify_emails: string[]
  mockup_task_assignee_id: string | null
}

/** The tenant's Settings > Leads row (migration 072), or null when there is none or the table is missing. */
async function readSettings(supabase: ServiceClient, tenantId: string): Promise<IntakeSettings | null> {
  const { data, error } = await supabase
    .from('lead_intake_settings')
    .select('notify_user_ids, notify_emails, mockup_task_assignee_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[website-lead-intake] settings read failed; using the function secrets', error)
    return null
  }
  return data as IntakeSettings | null
}

/** user_profiles.id -> auth user id, only for profiles that are active members of the tenant. */
async function activeMemberUserIds(supabase: ServiceClient, tenantId: string, profileIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!profileIds.length) return result
  const { data: profiles } = await supabase.from('user_profiles').select('id, user_id').in('id', profileIds)
  if (!profiles?.length) return result
  const { data: members } = await supabase
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', profiles.map((pr) => pr.user_id))
  const active = new Set((members ?? []).map((m) => m.user_id as string))
  for (const pr of profiles) if (active.has(pr.user_id)) result.set(pr.id as string, pr.user_id as string)
  return result
}

/**
 * Who gets the new-request email: the chosen members' login emails plus the extra addresses,
 * lower-cased and de-duplicated. Falls back to INTAKE_NOTIFY_TO when the settings name nobody.
 */
async function resolveRecipients(supabase: ServiceClient, tenantId: string, settings: IntakeSettings | null): Promise<string[]> {
  const found = new Set<string>()
  if (settings) {
    const members = await activeMemberUserIds(supabase, tenantId, settings.notify_user_ids ?? [])
    const emails = await Promise.all(
      [...members.values()].map(async (authId) => {
        const { data, error } = await supabase.auth.admin.getUserById(authId)
        if (error) console.error('[website-lead-intake] could not read a recipient email', authId, error)
        return data?.user?.email ?? ''
      }),
    )
    for (const e of [...emails, ...(settings.notify_emails ?? [])]) {
      const addr = e.trim().toLowerCase()
      if (addr && isValidEmail(addr)) found.add(addr)
    }
  }
  if (found.size === 0) {
    for (const e of (Deno.env.get('INTAKE_NOTIFY_TO') || '').split(',')) {
      const addr = e.trim().toLowerCase()
      if (addr && isValidEmail(addr)) found.add(addr)
    }
  }
  return [...found]
}

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

    // INTAKE_USER_ID is the login (auth) id, used for created_by. Owners and assignees reference
    // user_profiles.id, a different id, so look the profile up.
    const { data: profile } = await supabase.from('user_profiles').select('id').eq('user_id', userId).single()
    const profileId: string | null = profile?.id ?? null

    // Settings > Leads: the mock-up assignee (if still an active member) and the email recipients
    const settings = await readSettings(supabase, tenantId)
    let assigneeId = profileId
    if (settings?.mockup_task_assignee_id) {
      const active = await activeMemberUserIds(supabase, tenantId, [settings.mockup_task_assignee_id])
      if (active.has(settings.mockup_task_assignee_id)) assigneeId = settings.mockup_task_assignee_id
    }
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    const kindLabel = p.kind === 'mockup' ? 'Free mock-up request' : 'Question'
    const leadName = p.business || `${fullName} (question)`

    // Everything about the request as rich text for the lead's Notes: one labelled paragraph
    // per fact, every value escaped
    const notes = [
      labeledLine('Request', kindLabel),
      labeledLine('From', fullName),
      labeledLine('Email', p.email),
      labeledLine('Phone', p.phone || 'not given'),
      p.business ? labeledLine('Business', p.business) : '',
      p.needs.length ? labeledLine('What they need', p.needs.join(', ')) : '',
      p.kind === 'mockup' && p.mockup_due ? labeledLine('Free mock-up due', p.mockup_due) : '',
      p.estimate ? `<p><strong>Estimate from the calculator:</strong></p>${plainTextToHtml(p.estimate)}` : '',
      `<p>Sent from the website form${p.site ? ` on ${escapeHtml(p.site)}` : ''}.</p>`,
    ]
      .filter(Boolean)
      .join('')

    // 1. The lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        tenant_id: tenantId,
        lead_name: leadName,
        email: p.email,
        phone: p.phone || null,
        source: 'website',
        status: 'new',
        description: p.message_html || null,
        notes,
        estimated_value: p.estimate_value,
        source_automation_name: INTAKE_MARKER,
        lead_owner_id: profileId,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (leadError || !lead) {
      console.error('[website-lead-intake] lead insert failed', leadError)
      throw new Error('Lead insert failed')
    }

    // 2. The person, linked to the lead as its primary contact. A failure here keeps the lead.
    let contactLinked = false
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({ tenant_id: tenantId, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone || null, created_by: userId, updated_by: userId })
      .select('id')
      .single()
    if (contactError || !contact) {
      console.error('[website-lead-intake] contact insert failed', contactError)
    } else {
      const { error: linkError } = await supabase
        .from('lead_contacts')
        .insert({ tenant_id: tenantId, lead_id: lead.id, contact_id: contact.id, is_primary: true, is_decision_maker: true, created_by: userId, updated_by: userId })
      if (linkError) console.error('[website-lead-intake] lead_contacts insert failed', linkError)
      else contactLinked = true
    }

    // 3. For a mock-up: a task on the lead, assigned and due a business day before the mock-up
    let taskId: string | null = null
    let taskDue = ''
    if (p.kind === 'mockup') {
      taskDue = p.mockup_due_date ? businessDayBefore(p.mockup_due_date) : ''
      const today = new Date().toISOString().slice(0, 10)
      const description = [
        `${fullName}${p.business ? ` from ${p.business}` : ''} asked for a free homepage mock-up on the website.`,
        '',
        `Make the mock-up and send it to ${p.email}${p.mockup_due ? ` by ${p.mockup_due}` : ''}.${taskDue ? ` This task is due ${longDate(taskDue)}, a business day early, so there is time to review it.` : ''}`,
        '',
        `Contact: ${fullName}, ${p.email}, ${p.phone || 'no phone given'}`,
        p.needs.length ? `What they need: ${p.needs.join(', ')}` : '',
        p.message ? `\nTheir message:\n${p.message}` : '',
        p.estimate ? `\nEstimate from the calculator:\n${p.estimate}` : '',
      ]
        .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
        .join('\n')
      const { data: task, error: taskError } = await supabase
        .from('requirements')
        .insert({
          tenant_id: tenantId,
          sales_lead_id: lead.id,
          client_id: null,
          title: `Mock-up for ${p.business}`,
          description,
          requirement_type: 'task',
          is_task: true,
          status: 'open',
          urgency: 'high',
          importance: 'high',
          assigned_to_id: assigneeId,
          expected_start_date: today,
          // requirements use expected_due_date (renamed from expected_end_date in migration 014)
          expected_due_date: taskDue || null,
          // Production still has the old column too, and the task.assigned email (notify_task_assigned)
          // reads it, so it gets the same date
          expected_end_date: taskDue || null,
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single()
      if (taskError || !task) console.error('[website-lead-intake] task insert failed', taskError)
      else taskId = task.id
    }

    // 4. The new-request email, through LineUp's own send-notification (logged, editable template)
    const appUrl = (Deno.env.get('INTAKE_APP_URL') || 'https://www.lineupco.io').replace(/\/$/, '')
    const recipients = await resolveRecipients(supabase, tenantId, settings)
    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).single()
    const variables = {
      subject_line: p.kind === 'mockup' ? `New mock-up request: ${p.business}` : `New question from ${fullName}${p.business ? ` (${p.business})` : ''}`,
      request_kind: kindLabel,
      tenant_name: tenant?.name ?? '',
      site: p.site || 'your website',
      business: leadName,
      contact_name: fullName,
      email: p.email,
      phone: p.phone || 'No phone given',
      needs: p.needs.length ? p.needs.join(', ') : 'Not picked',
      mockup_due: p.kind === 'mockup' ? p.mockup_due || 'Not given' : 'Not a mock-up request',
      task_line: taskId ? `Mock-up for ${p.business}, due ${taskDue ? longDate(taskDue) : 'not set'}` : p.kind === 'mockup' ? 'The task could not be created; add it from the lead' : 'No task',
      message: p.message || 'No message',
      estimate: p.estimate || 'None',
      lead_url: `${appUrl}/leads/${lead.id}`,
    }
    const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const notified = await Promise.all(
      recipients.map(async (to) => {
        try {
          const res = await fetch(notifyUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger_key: 'lead.website', tenant_id: tenantId, recipient_email: to, variables }),
          })
          if (!res.ok) console.error('[website-lead-intake] notification failed', to, res.status)
          return res.ok
        } catch (err) {
          console.error('[website-lead-intake] notification error', to, err)
          return false
        }
      }),
    )

    return jsonResponse(req, { lead_id: lead.id, contact_linked: contactLinked, task_id: taskId, notified: notified.filter(Boolean).length }, 201)
  } catch (err) {
    return errorResponse(req, err)
  }
})
