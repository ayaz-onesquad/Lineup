// Supabase Edge Function: send-waitlist-welcome
// Triggered by Database Webhook when a new lead is inserted
//
// Setup in Supabase Dashboard:
// 1. Go to Database > Webhooks
// 2. Create new webhook:
//    - Name: send-waitlist-welcome
//    - Table: leads
//    - Events: INSERT
//    - Type: Supabase Edge Function
//    - Function: send-waitlist-welcome
//
// Required environment variables (set in Supabase Dashboard > Edge Functions):
// - RESEND_API_KEY: Your Resend API key
// - SUPABASE_URL: Auto-provided
// - SUPABASE_SERVICE_ROLE_KEY: Auto-provided
// - WEBHOOK_SECRET: Optional shared secret, for callers that cannot present the
//   service_role key. Send it as the `x-webhook-secret` header. A Supabase
//   Database Webhook already sends the service_role key as its bearer token, so
//   the default setup needs no extra configuration.
//
// AUTHORIZATION (added in the security hardening pass)
// The webhook URL was unauthenticated and trusted `payload.record` verbatim, so
// anyone who knew the URL could post a forged record and have this function
// send email from the tenant's sending domain to any address they chose.
//
// Two changes close that:
//   1. Every request must prove it is a trusted caller (service_role bearer
//      token, or the shared x-webhook-secret header).
//   2. The lead is re-read from the database by id. The posted record is used
//      only to identify which row to load, never as the content of the email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  AuthError,
  errorResponse,
  escapeHtmlValues,
  hasValidWebhookSecret,
  isServiceRoleCaller,
  isValidEmail,
} from '../_shared/security.ts'

// Type definitions
interface LeadRecord {
  id: string
  tenant_id: string
  lead_name: string
  email: string | null
  industry: string | null
  created_at: string
  source_automation_name?: string | null
}

// Leads filed by website-lead-intake are a business's own customers asking for a mock-up,
// not people joining the LineUp waitlist. Keep in step with INTAKE_MARKER there.
const WEBSITE_INTAKE_MARKER = 'Website form'

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: LeadRecord
  schema: string
  old_record: LeadRecord | null
}

interface NotificationTemplate {
  subject: string
  html_body: string
}

interface EmailConfig {
  from_name: string
  from_email: string
  reply_to_email: string | null
}

// Template variable rendering
// Values are HTML-escaped before substitution into the email body, so a lead
// name containing markup cannot inject content into the outgoing email.
function renderTemplate(template: string, variables: Record<string, string>): string {
  const safe = escapeHtmlValues(variables)
  return Object.entries(safe).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ''),
    template
  )
}

// The subject is plain text: escaping it would show entities in the inbox.
// Newlines are stripped to prevent mail-header injection.
function renderSubject(template: string, variables: Record<string, string>): string {
  const rendered = Object.entries(variables ?? {}).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? '')),
    template
  )
  return rendered.replace(/[\r\n]+/g, ' ').slice(0, 300)
}

// Create Supabase client with service role
function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// Send email via Resend
async function sendViaResend(
  fromName: string,
  fromEmail: string,
  replyTo: string | null,
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const emailPayload: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [toEmail],
    subject: subject,
    html: htmlBody,
  }

  if (replyTo) {
    emailPayload.reply_to = replyTo
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      return { success: false, error: `Resend API error (${response.status}): ${errorBody}` }
    }

    const result = await response.json()
    console.log('Email sent successfully:', result)
    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Failed to call Resend API: ${errorMessage}` }
  }
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  // Only accept POST requests (webhook payload)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // AUTHORIZATION: proof of a trusted caller is required. Without it this
  // endpoint is an open email relay for anyone who learns the URL.
  //
  // A Supabase Database Webhook of type "Supabase Edge Function" sends the
  // service_role key as its bearer token, so no extra configuration is needed
  // for the normal path. A shared `x-webhook-secret` header is also accepted
  // for callers that cannot send the key.
  try {
    if (!isServiceRoleCaller(req) && !hasValidWebhookSecret(req)) {
      throw new AuthError(
        'This endpoint requires the service_role key or a valid x-webhook-secret header',
        401
      )
    }
  } catch (err) {
    return errorResponse(req, err)
  }

  let payload: WebhookPayload

  try {
    payload = await req.json() as WebhookPayload
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: `Invalid payload: ${errorMessage}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Only process INSERT events on leads table
  if (payload.type !== 'INSERT' || payload.table !== 'leads') {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'Not a lead INSERT event'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Only the row id is taken from the payload. Everything that reaches the
  // email body is re-read from the database below, so a forged payload cannot
  // control the recipient or the content.
  const postedId = payload.record?.id
  if (!postedId || !/^[0-9a-f-]{36}$/i.test(postedId)) {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'Payload did not contain a valid lead id'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let supabase: ReturnType<typeof createServiceClient>
  let lead: LeadRecord

  try {
    supabase = createServiceClient()

    const { data: storedLead, error: leadError } = await supabase
      .from('leads')
      .select('id, tenant_id, lead_name, email, industry, created_at, source_automation_name')
      .eq('id', postedId)
      .is('deleted_at', null)
      .single()

    if (leadError || !storedLead) {
      console.error('Lead not found for id', postedId, leadError)
      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'Lead not found'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    lead = storedLead as LeadRecord
  } catch (err) {
    console.error('Could not load lead:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Website mock-up requests aren't waitlist signups
  if (lead.source_automation_name === WEBSITE_INTAKE_MARKER) {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'Lead came from a website intake, not the waitlist'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Must have a valid email to send a welcome
  if (!lead.email || !isValidEmail(lead.email)) {
    return new Response(JSON.stringify({
      status: 'skipped',
      reason: 'Lead has no valid email address'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  console.log(`Processing waitlist welcome for lead: ${lead.id}`)

  try {

    // Get the email template
    const { data: template, error: templateError } = await supabase
      .from('notification_templates')
      .select('subject, html_body')
      .eq('trigger_key', 'lead.waitlist_welcome')
      .eq('is_active', true)
      .single()

    if (templateError || !template) {
      console.error('Template not found or inactive:', templateError)
      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'Template not found or inactive'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check tenant settings
    const { data: tenantSettings } = await supabase
      .from('tenant_notification_settings')
      .select('is_active, has_override, custom_subject, custom_html_body')
      .eq('tenant_id', lead.tenant_id)
      .eq('trigger_key', 'lead.waitlist_welcome')
      .single()

    // If tenant has explicitly disabled this notification
    if (tenantSettings && !tenantSettings.is_active) {
      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'Notification disabled for this tenant'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use tenant override if available
    let subject = template.subject
    let htmlBody = template.html_body

    if (tenantSettings?.has_override && tenantSettings.custom_html_body) {
      subject = tenantSettings.custom_subject ?? template.subject
      htmlBody = tenantSettings.custom_html_body
    }

    // Get email sender configuration
    const { data: emailConfig, error: configError } = await supabase
      .from('notification_email_config')
      .select('from_name, from_email, reply_to_email')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (configError || !emailConfig) {
      console.error('Email config not found:', configError)
      return new Response(JSON.stringify({
        status: 'failed',
        error: 'Email sender not configured'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Prepare template variables
    const variables = {
      lead_name: lead.lead_name || 'there',
      lead_email: lead.email,
      lead_company: lead.industry || '',
      signup_date: new Date(lead.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }

    // Render template
    const renderedSubject = renderSubject(subject, variables)
    const renderedHtml = renderTemplate(htmlBody, variables)

    // Send the email
    const sendResult = await sendViaResend(
      emailConfig.from_name,
      emailConfig.from_email,
      emailConfig.reply_to_email,
      lead.email,
      renderedSubject,
      renderedHtml
    )

    // Log the result
    await supabase.from('notification_send_log').insert({
      tenant_id: lead.tenant_id,
      trigger_key: 'lead.waitlist_welcome',
      recipient_email: lead.email,
      subject: renderedSubject,
      status: sendResult.success ? 'sent' : 'failed',
      error_message: sendResult.error ?? null,
      sent_at: new Date().toISOString(),
    })

    if (sendResult.success) {
      console.log(`✅ Waitlist welcome email sent to ${lead.email}`)
      return new Response(JSON.stringify({
        status: 'sent',
        recipient: lead.email
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      console.error(`❌ Failed to send email: ${sendResult.error}`)
      return new Response(JSON.stringify({
        status: 'failed',
        error: sendResult.error
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Unexpected error:', err)

    return new Response(JSON.stringify({
      status: 'failed',
      error: errorMessage
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
