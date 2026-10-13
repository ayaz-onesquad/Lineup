-- Migration 066: Lead Waitlist Welcome Email Template
--
-- Creates a stunning email template for waitlist signups.
-- The email is triggered via Supabase Database Webhook → Edge Function.
--
-- SETUP REQUIRED (after running this migration):
-- 1. Deploy the edge function:
--    npx supabase functions deploy send-waitlist-welcome --no-verify-jwt
--
-- 2. Create Database Webhook in Supabase Dashboard:
--    - Go to Database > Webhooks > Create webhook
--    - Name: send-waitlist-welcome
--    - Table: leads
--    - Events: INSERT
--    - Type: Supabase Edge Function
--    - Function: send-waitlist-welcome
--    - HTTP Headers: Add Authorization header with service role key
--
-- 3. Ensure RESEND_API_KEY is set in Edge Function secrets:
--    - Go to Edge Functions > send-waitlist-welcome > Secrets
--    - Add RESEND_API_KEY with your Resend API key

-- ============================================================================
-- 1. INSERT WAITLIST WELCOME EMAIL TEMPLATE
-- ============================================================================

INSERT INTO notification_templates (
    trigger_key,
    name,
    description,
    subject,
    html_body,
    available_variables,
    is_system,
    is_active
) VALUES (
    'lead.waitlist_welcome',
    'Waitlist Welcome Email',
    'Sent automatically when a new lead joins the waitlist. Creates excitement and invites feature feedback.',
    '🎉 You''re In! Welcome to the LineUp Waitlist',
    '<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to LineUp</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px;">

          <!-- HERO SECTION -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); border-radius: 24px 24px 0 0; padding: 60px 40px; text-align: center;">
              <div style="width: 100px; height: 100px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 24px; line-height: 100px;">
                <span style="font-size: 48px; color: #ffffff;">✓</span>
              </div>
              <h1 style="margin: 0 0 16px 0; font-size: 36px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                You''re On The List!
              </h1>
              <p style="margin: 0; font-size: 18px; color: rgba(255,255,255,0.9); font-weight: 500;">
                Welcome to something extraordinary, {{lead_name}}
              </p>
            </td>
          </tr>

          <!-- MAIN CONTENT -->
          <tr>
            <td style="background-color: #18181b; padding: 48px 40px;">

              <!-- Welcome Message -->
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.7; color: #a1a1aa;">
                You''ve just secured your spot among the first to experience <strong style="color: #ffffff;">LineUp</strong> — the agency command center that transforms chaos into clarity.
              </p>

              <!-- Feature Preview Cards -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td style="background-color: #27272a; border-radius: 16px; padding: 24px; border-left: 4px solid #6366f1;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em;">
                      🚀 What''s Coming
                    </h3>
                    <ul style="margin: 0; padding: 0 0 0 20px; color: #d4d4d8; font-size: 15px; line-height: 1.8;">
                      <li style="margin-bottom: 8px;">Complete project visibility from client to task</li>
                      <li style="margin-bottom: 8px;">Intelligent priority engine that surfaces what matters</li>
                      <li style="margin-bottom: 8px;">Real-time collaboration without the noise</li>
                      <li>Beautiful dashboards that make reporting effortless</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Launch Date Teaser -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.15) 100%); border: 1px solid rgba(99,102,241,0.3); border-radius: 16px; padding: 32px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.1em;">
                      📅 Launch Date
                    </p>
                    <p style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff;">
                      Coming Soon
                    </p>
                    <p style="margin: 12px 0 0 0; font-size: 14px; color: #71717a;">
                      We''ll email you the moment we''re ready
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #27272a; margin: 40px 0;">

              <!-- Feedback Request -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color: #1c1c1f; border-radius: 16px; padding: 32px; text-align: center;">
                    <span style="font-size: 32px; display: block; margin-bottom: 16px;">💭</span>
                    <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
                      Help Us Build For You
                    </h3>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #a1a1aa;">
                      We''re building LineUp with our early community in mind. <strong style="color: #d4d4d8;">What features would make your agency life easier?</strong>
                    </p>
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #a1a1aa;">
                      Simply reply to this email with:
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                      <tr>
                        <td style="padding: 8px 0; color: #d4d4d8; font-size: 14px; text-align: left;">
                          <span style="margin-right: 12px;">✨</span> Your top 3 must-have features
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #d4d4d8; font-size: 14px; text-align: left;">
                          <span style="margin-right: 12px;">🔥</span> Pain points in your current workflow
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #d4d4d8; font-size: 14px; text-align: left;">
                          <span style="margin-right: 12px;">❓</span> Any questions about LineUp
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 24px 0 0 0; font-size: 13px; color: #71717a; font-style: italic;">
                      Every reply is read by a real human on our team
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #09090b; border-radius: 0 0 24px 24px; padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                LineUp
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #52525b;">
                The Agency Command Center
              </p>
              <p style="margin: 0; font-size: 12px; color: #3f3f46;">
                You''re receiving this because you joined our waitlist.<br>
                We promise to only send you important updates.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
    '{
        "lead_name": "The name of the lead who joined the waitlist",
        "lead_email": "The email address of the lead",
        "lead_company": "The company/industry if provided",
        "signup_date": "The date they joined the waitlist (formatted)"
    }'::jsonb,
    true,
    true
) ON CONFLICT (trigger_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    subject = EXCLUDED.subject,
    html_body = EXCLUDED.html_body,
    available_variables = EXCLUDED.available_variables,
    updated_at = now();

-- ============================================================================
-- 2. DOCUMENTATION COMMENT
-- ============================================================================

COMMENT ON TABLE notification_templates IS
'Global notification email templates. The lead.waitlist_welcome template is triggered via
Database Webhook when a new lead is inserted. See migration 066 header for setup instructions.';
