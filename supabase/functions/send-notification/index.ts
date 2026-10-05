// Supabase Edge Function: send-notification
// Handles email notification dispatch via Resend
//
// Required environment variables (set in Supabase Dashboard):
// - RESEND_API_KEY: Your Resend API key
// - APP_URL: Your app's public URL (e.g., https://yourapp.vercel.app)
// - SUPABASE_URL: Auto-provided by Supabase
// - SUPABASE_SERVICE_ROLE_KEY: Auto-provided by Supabase
// - SUPABASE_ANON_KEY: Auto-provided by Supabase (used to verify the caller)
// - ALLOWED_ORIGINS: Comma-separated list of browser origins allowed to call this
// - WEBHOOK_SECRET: Shared secret for database-trigger / server-to-server callers
//
// AUTHORIZATION (added in the security hardening pass)
// This function holds the service_role key and sends email. It previously ran
// with no authorization check at all, which made it an open email relay to
// anyone holding the public anon key. Callers must now present EITHER a valid
// user session (and be an active member of the tenant they name), OR the
// service_role key as a bearer token, OR the shared webhook secret.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  checkRateLimit,
  errorResponse,
  escapeHtmlValues,
  hasValidWebhookSecret,
  isServiceRoleCaller,
  isValidEmail,
  jsonResponse,
  preflightResponse,
  requireTenantMembership,
  requireUser,
} from '../_shared/security.ts'

// Type definitions
interface NotificationPayload {
  trigger_key: string
  tenant_id: string
  variables: Record<string, string>
  recipient_email: string
}

interface NotificationTemplate {
  id: string
  trigger_key: string
  subject: string
  html_body: string
  is_active: boolean
}

interface TenantNotificationSettings {
  id: string
  tenant_id: string
  trigger_key: string
  is_active: boolean
  has_override: boolean
  custom_subject: string | null
  custom_html_body: string | null
}

interface EmailConfig {
  id: string
  from_name: string
  from_email: string
  reply_to_email: string | null
  is_active: boolean
}

interface ResendEmailPayload {
  from: string
  reply_to?: string
  to: string[]
  subject: string
  html: string
}

interface NotificationResult {
  success: boolean
  status: 'sent' | 'failed' | 'skipped'
  logId?: string
  reason?: string
  error?: string
}

// Template rendering function.
//
// `variables` comes from the request body and is substituted into an HTML email
// body, so every value is HTML-escaped first. Without this a caller could
// inject markup (a phishing form, a tracking pixel) into mail sent from the
// tenant's own sending domain.
function renderTemplate(template: string, variables: Record<string, string>): string {
  const safe = escapeHtmlValues(variables)
  return Object.entries(safe).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ''),
    template
  )
}

// The subject line is plain text, so it must NOT be HTML-escaped (otherwise an
// apostrophe in a name shows up as &#39; in the inbox). Newlines are stripped
// to prevent header injection.
function renderSubject(template: string, variables: Record<string, string>): string {
  const rendered = Object.entries(variables ?? {}).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value ?? '')),
    template
  )
  return rendered.replace(/[\r\n]+/g, ' ').slice(0, 300)
}

// Create Supabase client with service role (bypasses RLS)
function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

// Log notification result to database
async function logNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload,
  subject: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
): Promise<string | null> {
  const { data, error } = await supabase
    .from('notification_send_log')
    .insert({
      tenant_id: payload.tenant_id,
      trigger_key: payload.trigger_key,
      recipient_email: payload.recipient_email,
      subject: subject,
      status: status,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to write notification log:', error)
    return null
  }

  return data?.id ?? null
}

// Send email via Resend
async function sendViaResend(
  emailConfig: EmailConfig,
  recipientEmail: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const emailPayload: ResendEmailPayload = {
    from: `${emailConfig.from_name} <${emailConfig.from_email}>`,
    to: [recipientEmail],
    subject: subject,
    html: htmlBody,
  }

  if (emailConfig.reply_to_email) {
    emailPayload.reply_to = emailConfig.reply_to_email
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

    return { success: true }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: `Failed to call Resend API: ${errorMessage}` }
  }
}

// Main handler
serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return preflightResponse(req)
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  let payload: NotificationPayload
  let supabase: SupabaseClient

  try {
    payload = await req.json() as NotificationPayload
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  if (!payload.trigger_key || !payload.tenant_id || !payload.recipient_email) {
    return jsonResponse(
      req,
      { error: 'Missing required fields: trigger_key, tenant_id, recipient_email' },
      400
    )
  }

  if (!isValidEmail(payload.recipient_email)) {
    return jsonResponse(req, { error: 'recipient_email is not a valid address' }, 400)
  }

  // ---------------------------------------------------------------------------
  // AUTHORIZATION — must run before the service_role client is created.
  //
  // Two accepted callers:
  //   1. A trusted internal caller: the service_role key as a bearer token
  //      (how the database notification triggers call in) or the shared
  //      webhook secret.
  //   2. A signed-in user who is an active member of payload.tenant_id.
  // ---------------------------------------------------------------------------
  try {
    // Trusted internal caller: the database notification triggers invoke this
    // through pg_net with `Authorization: Bearer <service_role_key>`, and the
    // key is compared against this function's own copy. The public anon key
    // does not match, which is what closes the original hole.
    const isInternal = isServiceRoleCaller(req) || hasValidWebhookSecret(req)

    if (isInternal) {
      checkRateLimit(`notify:internal:${payload.tenant_id}`, 300, 60_000)
    } else {
      const ctx = await requireUser(req)
      // The tenant is verified against tenant_users, never trusted from the body.
      await requireTenantMembership(ctx, payload.tenant_id)
      checkRateLimit(`notify:user:${ctx.userId}`, 30, 60_000)
    }
  } catch (err) {
    return errorResponse(req, err)
  }

  try {
    supabase = createServiceClient()
  } catch (err) {
    console.error('[send-notification] Service client unavailable:', err)
    return jsonResponse(req, { error: 'Service misconfigured' }, 500)
  }

  try {
    // Step 1: Check if global template exists and is active
    const { data: globalTemplate, error: templateError } = await supabase
      .from('notification_templates')
      .select('id, trigger_key, subject, html_body, is_active')
      .eq('trigger_key', payload.trigger_key)
      .single()

    if (templateError || !globalTemplate) {
      const result: NotificationResult = {
        success: true,
        status: 'skipped',
        reason: 'template_not_found',
      }
      return jsonResponse(req, result, 200)
    }

    if (!globalTemplate.is_active) {
      const result: NotificationResult = {
        success: true,
        status: 'skipped',
        reason: 'global_template_disabled',
      }
      return jsonResponse(req, result, 200)
    }

    // Step 2: Check tenant notification settings
    const { data: tenantSettings } = await supabase
      .from('tenant_notification_settings')
      .select('id, tenant_id, trigger_key, is_active, has_override, custom_subject, custom_html_body')
      .eq('tenant_id', payload.tenant_id)
      .eq('trigger_key', payload.trigger_key)
      .single()

    // If tenant has explicitly disabled this notification
    if (tenantSettings && !tenantSettings.is_active) {
      const result: NotificationResult = {
        success: true,
        status: 'skipped',
        reason: 'tenant_disabled',
      }
      return jsonResponse(req, result, 200)
    }

    // Step 3: Resolve template (tenant override or global)
    let subject: string
    let htmlBody: string

    if (tenantSettings?.has_override && tenantSettings.custom_html_body) {
      subject = tenantSettings.custom_subject ?? globalTemplate.subject
      htmlBody = tenantSettings.custom_html_body
    } else {
      subject = globalTemplate.subject
      htmlBody = globalTemplate.html_body
    }

    // Step 4: Render template with variables
    const renderedSubject = renderSubject(subject, payload.variables)
    const renderedHtml = renderTemplate(htmlBody, payload.variables)

    // Step 5: Get email sender configuration
    const { data: emailConfig, error: configError } = await supabase
      .from('notification_email_config')
      .select('id, from_name, from_email, reply_to_email, is_active')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (configError || !emailConfig) {
      // Log failed attempt
      const logId = await logNotification(
        supabase,
        payload,
        renderedSubject,
        'failed',
        'Email sender not configured. Set up sender in SysAdmin > Notifications.'
      )

      const result: NotificationResult = {
        success: false,
        status: 'failed',
        logId: logId ?? undefined,
        error: 'Email sender not configured. Set up sender in SysAdmin > Notifications.',
      }
      return jsonResponse(req, result, 200)
    }

    // Step 6: Send email via Resend
    const sendResult = await sendViaResend(
      emailConfig,
      payload.recipient_email,
      renderedSubject,
      renderedHtml
    )

    // Step 7: Log result
    const logId = await logNotification(
      supabase,
      payload,
      renderedSubject,
      sendResult.success ? 'sent' : 'failed',
      sendResult.success ? null : (sendResult.error ?? 'Unknown error')
    )

    // Step 8: Return result
    const result: NotificationResult = {
      success: sendResult.success,
      status: sendResult.success ? 'sent' : 'failed',
      logId: logId ?? undefined,
      error: sendResult.error,
    }

    return jsonResponse(req, result, 200)

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    console.error('Notification dispatch error:', err)

    // Try to log the failure
    try {
      await logNotification(
        supabase,
        payload,
        'Unknown',
        'failed',
        `Unexpected error: ${errorMessage}`
      )
    } catch (logErr) {
      console.error('Failed to log error:', logErr)
    }

    const result: NotificationResult = {
      success: false,
      status: 'failed',
      error: errorMessage,
    }

    return jsonResponse(req, result, 500)
  }
})
