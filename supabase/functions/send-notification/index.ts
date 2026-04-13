// Supabase Edge Function: send-notification
// Handles email notification dispatch via Resend
//
// Required environment variables (set in Supabase Dashboard):
// - RESEND_API_KEY: Your Resend API key
// - APP_URL: Your app's public URL (e.g., https://yourapp.vercel.app)
// - SUPABASE_URL: Auto-provided by Supabase
// - SUPABASE_SERVICE_ROLE_KEY: Auto-provided by Supabase

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

// Template rendering function
function renderTemplate(template: string, variables: Record<string, string>): string {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value ?? ''),
    template
  )
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
  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: NotificationPayload
  let supabase: SupabaseClient

  try {
    payload = await req.json() as NotificationPayload
    supabase = createServiceClient()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: `Invalid request: ${errorMessage}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate required fields
  if (!payload.trigger_key || !payload.tenant_id || !payload.recipient_email) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: trigger_key, tenant_id, recipient_email' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
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
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!globalTemplate.is_active) {
      const result: NotificationResult = {
        success: true,
        status: 'skipped',
        reason: 'global_template_disabled',
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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
    const renderedSubject = renderTemplate(subject, payload.variables)
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
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

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

    return new Response(JSON.stringify(result), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
