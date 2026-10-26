-- Migration 073: Per-tenant email senders, and a confirmation email to the person who sent a
-- website request
--
-- 1. notification_email_config gets a nullable tenant_id. The existing row (tenant_id NULL) stays
--    LineUp's global sender. A row with a tenant_id is that tenant's own sender ("OneSquad
--    <team@theonesquad.com>"); send-notification uses it for that tenant's email when it is
--    active and falls back to the global row otherwise. At most one global row (as before) and at
--    most one active sender per tenant. Rows stay SysAdmin-only: no tenant member can read or
--    change a sender.
-- 2. notification_send_log.status may be 'skipped' (send-notification logs a confirmation it did
--    not send because the tenant has no sender of its own).
-- 3. lead_intake_settings.confirm_to_contact (default true): Settings > Leads switch for the
--    confirmation email.
-- 4. The `lead.website.received` template, sent by website-lead-intake (v4) to the person who
--    sent the request, only from the tenant's own sender.
--
-- A tenant sender's domain must be verified in the Resend account LineUp sends with before its
-- row is turned on (docs/WEBSITE_LEAD_INTAKE.md).
--
-- Safe to run more than once.

-- ============================================================================
-- 1. Per-tenant senders
-- ============================================================================

ALTER TABLE notification_email_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN notification_email_config.tenant_id IS
  'NULL: LineUp''s global sender (one row). Set: that tenant''s own sender, used for its email when active (migration 073).';

-- The 060 singleton allowed one row in the whole table. Replace it with:
--   one global row (tenant_id NULL), active or not, which SysAdmin > Notifications edits;
--   at most one active sender per tenant (inactive drafts may pile up).
DROP INDEX IF EXISTS idx_notification_email_config_singleton;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_email_config_global
  ON notification_email_config ((true))
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_email_config_tenant_active
  ON notification_email_config (tenant_id)
  WHERE tenant_id IS NOT NULL AND is_active;

COMMENT ON TABLE notification_email_config IS
  'Email senders. One global row (tenant_id NULL) plus at most one active sender per tenant. SysAdmin access only.';

-- RLS (unchanged since 060, restated so this file documents it): every policy is SysAdmin-only,
-- so tenant members, org admins included, can neither read nor write any sender. The policies are
-- recreated for `authenticated` only, and UPDATE gets an explicit WITH CHECK. There is no DELETE
-- policy, so nobody deletes through the API; SysAdmins turn a sender off with is_active.
ALTER TABLE notification_email_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_email_config_sys_admin_select" ON notification_email_config;
CREATE POLICY "notification_email_config_sys_admin_select" ON notification_email_config
  FOR SELECT TO authenticated
  USING (public.is_sys_admin());

DROP POLICY IF EXISTS "notification_email_config_sys_admin_insert" ON notification_email_config;
CREATE POLICY "notification_email_config_sys_admin_insert" ON notification_email_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_sys_admin());

DROP POLICY IF EXISTS "notification_email_config_sys_admin_update" ON notification_email_config;
CREATE POLICY "notification_email_config_sys_admin_update" ON notification_email_config
  FOR UPDATE TO authenticated
  USING (public.is_sys_admin())
  WITH CHECK (public.is_sys_admin());

-- Grants: 060 granted SELECT, INSERT, UPDATE to authenticated; Supabase's default privileges also
-- give anon and authenticated everything else (DELETE, TRUNCATE...). Keep only what the SysAdmin
-- screen uses. The Edge Functions use service_role, which is untouched.
REVOKE ALL ON notification_email_config FROM anon;
REVOKE ALL ON notification_email_config FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON notification_email_config TO authenticated;

-- ============================================================================
-- 2. 'skipped' in the send log
-- ============================================================================

ALTER TABLE notification_send_log DROP CONSTRAINT IF EXISTS notification_send_log_status_check;
ALTER TABLE notification_send_log ADD CONSTRAINT notification_send_log_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'skipped'));

-- ============================================================================
-- 3. Settings > Leads: the confirmation switch
-- ============================================================================

ALTER TABLE lead_intake_settings
  ADD COLUMN IF NOT EXISTS confirm_to_contact BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN lead_intake_settings.confirm_to_contact IS
  'Email a confirmation (lead.website.received) to the person who sent a website request. Sent only from the tenant''s own sender (migration 073).';

-- ============================================================================
-- 4. lead.website.received template (to the visitor)
-- ============================================================================
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'lead.website.received',
    'Website Request Received',
    'Sent to the person who sent a request on the tenant''s website, from the tenant''s own sender only (never LineUp''s). Turned off per tenant in Settings > Leads.',
    '{{subject_line}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{subject_line}}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; color: #111111;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 32px 16px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="width: 100%; max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e5e5; border-radius: 4px;">
                    <tr>
                        <td style="padding: 28px 32px 0;">
                            <p style="margin: 0; color: #111111; font-size: 15px; font-weight: 700; letter-spacing: 0.01em;">{{tenant_name}}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 32px 8px;">
                            <p style="margin: 0 0 20px; color: #111111; font-size: 16px; line-height: 1.5;">Hi {{first_name}},</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 16px;">
                                <tr><td style="width: 32px; height: 3px; background-color: #b4532a; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                            </table>
                            <h1 style="margin: 0 0 12px; color: #111111; font-size: 26px; line-height: 1.25; font-weight: 700;">{{headline}}</h1>
                            <p style="margin: 0; color: #404040; font-size: 16px; line-height: 1.55;">{{next_line}}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px 32px 8px;">
                            <p style="margin: 0 0 8px; color: #111111; font-size: 14px; font-weight: 700;">What you sent</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 15px; line-height: 1.5; color: #262626; border-top: 1px solid #e5e5e5;">
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e5e5;">
                                        <p style="margin: 0; color: #737373; font-size: 13px;">Business</p>
                                        <p style="margin: 2px 0 0;">{{business}}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e5e5;">
                                        <p style="margin: 0; color: #737373; font-size: 13px;">What you need</p>
                                        <p style="margin: 2px 0 0;">{{needs}}</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e5e5;">
                                        <p style="margin: 0; color: #737373; font-size: 13px;">Your message</p>
                                        <p style="margin: 2px 0 0; white-space: pre-line; word-break: break-word;">{{message}}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px 32px 32px;">
                            <p style="margin: 0 0 20px; color: #262626; font-size: 16px; line-height: 1.55;">Questions? Just reply to this email.</p>
                            <p style="margin: 0; color: #111111; font-size: 16px; font-weight: 700;">{{tenant_name}}</p>
                            <p style="margin: 2px 0 0; color: #737373; font-size: 14px;">{{reply_email}}</p>
                        </td>
                    </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="width: 100%; max-width: 560px; margin: 0 auto;">
                    <tr>
                        <td style="padding: 16px 32px 0;">
                            <p style="margin: 0; color: #8a8a8a; font-size: 12px; line-height: 1.5;">You are getting this because you sent a request on {{site}}.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"subject_line": "Subject, e.g. Your free mock-up request is in", "first_name": "First name of the person who sent the request", "tenant_name": "Organization name", "headline": "e.g. We got your request.", "next_line": "What happens next", "business": "Their business, or Not given", "needs": "What they need, or Not picked", "message": "Their message as plain text, or No message", "reply_email": "The sender''s reply-to address, or empty", "site": "The website the request came from"}'::jsonb,
    true,
    true
)
ON CONFLICT (trigger_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    subject = EXCLUDED.subject,
    html_body = EXCLUDED.html_body,
    available_variables = EXCLUDED.available_variables,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
