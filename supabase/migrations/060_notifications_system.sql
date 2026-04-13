-- Migration 060: Notifications System
--
-- Creates the complete notification infrastructure:
-- 1. notification_email_config - Global sender configuration (SysAdmin only)
-- 2. notification_templates - System-level email templates (SysAdmin manages, others read)
-- 3. tenant_notification_settings - Per-tenant overrides and preferences
-- 4. notification_subscriptions - User subscriptions to notification triggers
-- 5. notification_send_log - Audit trail of sent notifications
--
-- Phase 2 TODOs (not implemented):
-- - Custom trigger builder for tenants
-- - Per-tenant from_email overrides
-- - Template versioning

-- ============================================================================
-- 1. NOTIFICATION EMAIL CONFIG (Global sender settings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_email_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Sender configuration
    from_name TEXT NOT NULL DEFAULT 'LineUp',
    from_email TEXT NOT NULL DEFAULT 'noreply@lineup.app',
    reply_to_email TEXT,

    -- Provider settings
    provider TEXT NOT NULL DEFAULT 'resend',
    api_key_encrypted TEXT, -- Encrypted API key for the email provider

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enforce single row constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_email_config_singleton
    ON notification_email_config ((true));

-- Enable RLS
ALTER TABLE notification_email_config ENABLE ROW LEVEL SECURITY;

-- RLS: Only SysAdmin can access
CREATE POLICY "notification_email_config_sys_admin_select" ON notification_email_config
    FOR SELECT USING (public.is_sys_admin());

CREATE POLICY "notification_email_config_sys_admin_insert" ON notification_email_config
    FOR INSERT WITH CHECK (public.is_sys_admin());

CREATE POLICY "notification_email_config_sys_admin_update" ON notification_email_config
    FOR UPDATE USING (public.is_sys_admin());

COMMENT ON TABLE notification_email_config IS 'Global email sender configuration. Only one row allowed. SysAdmin access only.';
COMMENT ON COLUMN notification_email_config.api_key_encrypted IS 'Phase 2: Encrypted API key for custom email provider';

-- ============================================================================
-- 2. NOTIFICATION TEMPLATES (Global system templates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Template identification
    trigger_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,

    -- Email content
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,

    -- Metadata
    available_variables JSONB NOT NULL DEFAULT '{}',

    -- Flags
    is_system BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_templates_trigger_key
    ON notification_templates(trigger_key);
CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active
    ON notification_templates(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- RLS: SysAdmin full access, others can SELECT only (needed to show templates in tenant settings)
CREATE POLICY "notification_templates_sys_admin_all" ON notification_templates
    FOR ALL USING (public.is_sys_admin());

CREATE POLICY "notification_templates_authenticated_select" ON notification_templates
    FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND NOT public.is_sys_admin() -- Avoid duplicate rows from sys_admin policy
    );

COMMENT ON TABLE notification_templates IS 'Global notification email templates. SysAdmin manages, all authenticated users can read.';
COMMENT ON COLUMN notification_templates.trigger_key IS 'Machine-readable identifier (e.g., user.welcome, task.assigned)';
COMMENT ON COLUMN notification_templates.available_variables IS 'JSON object documenting available merge variables and their descriptions';

-- ============================================================================
-- 3. TENANT NOTIFICATION SETTINGS (Per-tenant overrides)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
    trigger_key TEXT NOT NULL,

    -- Settings
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Custom overrides (Phase 2: expand with more customization options)
    custom_subject TEXT,
    custom_html_body TEXT,

    -- Computed field
    has_override BOOLEAN GENERATED ALWAYS AS (custom_html_body IS NOT NULL) STORED,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),

    -- Constraints
    CONSTRAINT tenant_notification_settings_unique UNIQUE (tenant_id, trigger_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_notification_settings_tenant_id
    ON tenant_notification_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_notification_settings_trigger_key
    ON tenant_notification_settings(trigger_key);

-- Enable RLS
ALTER TABLE tenant_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS: SysAdmin can see all, OrgAdmin can manage their tenant, OrgUser can read their tenant
CREATE POLICY "tenant_notification_settings_sys_admin_all" ON tenant_notification_settings
    FOR ALL USING (public.is_sys_admin());

CREATE POLICY "tenant_notification_settings_org_admin_select" ON tenant_notification_settings
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND NOT public.is_sys_admin()
    );

CREATE POLICY "tenant_notification_settings_org_admin_insert" ON tenant_notification_settings
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

CREATE POLICY "tenant_notification_settings_org_admin_update" ON tenant_notification_settings
    FOR UPDATE USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

COMMENT ON TABLE tenant_notification_settings IS 'Per-tenant notification preferences and template overrides.';
COMMENT ON COLUMN tenant_notification_settings.has_override IS 'Computed: true if tenant has customized the template body';

-- ============================================================================
-- 4. NOTIFICATION SUBSCRIPTIONS (User subscriptions for PM feature)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relationships
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    trigger_key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscribed_by UUID NOT NULL REFERENCES auth.users(id),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT notification_subscriptions_unique UNIQUE (tenant_id, trigger_key, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_tenant_trigger
    ON notification_subscriptions(tenant_id, trigger_key);
CREATE INDEX IF NOT EXISTS idx_notification_subscriptions_user_id
    ON notification_subscriptions(user_id);

-- Enable RLS
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS: SysAdmin all, OrgAdmin manages tenant, OrgUser sees own
CREATE POLICY "notification_subscriptions_sys_admin_all" ON notification_subscriptions
    FOR ALL USING (public.is_sys_admin());

CREATE POLICY "notification_subscriptions_org_admin_select" ON notification_subscriptions
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

CREATE POLICY "notification_subscriptions_org_admin_insert" ON notification_subscriptions
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

CREATE POLICY "notification_subscriptions_org_admin_delete" ON notification_subscriptions
    FOR DELETE USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

CREATE POLICY "notification_subscriptions_user_own_select" ON notification_subscriptions
    FOR SELECT USING (
        user_id = auth.uid()
        AND tenant_id IN (SELECT public.get_user_tenant_ids())
        AND NOT public.is_sys_admin()
        AND NOT public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
    );

COMMENT ON TABLE notification_subscriptions IS 'User subscriptions to notification triggers. OrgAdmin can subscribe team members.';

-- ============================================================================
-- 5. NOTIFICATION SEND LOG (Audit trail - Phase 2 reporting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_send_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Context
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    trigger_key TEXT NOT NULL,

    -- Recipient
    recipient_email TEXT NOT NULL,

    -- Email details
    subject TEXT NOT NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notification_send_log_tenant_created
    ON notification_send_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_send_log_status
    ON notification_send_log(status);
CREATE INDEX IF NOT EXISTS idx_notification_send_log_trigger_key
    ON notification_send_log(trigger_key);

-- Enable RLS
ALTER TABLE notification_send_log ENABLE ROW LEVEL SECURITY;

-- RLS: SysAdmin sees all, OrgAdmin sees their tenant
CREATE POLICY "notification_send_log_sys_admin_select" ON notification_send_log
    FOR SELECT USING (public.is_sys_admin());

CREATE POLICY "notification_send_log_sys_admin_insert" ON notification_send_log
    FOR INSERT WITH CHECK (public.is_sys_admin());

CREATE POLICY "notification_send_log_org_admin_select" ON notification_send_log
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin'])
        AND NOT public.is_sys_admin()
    );

-- Service role needs insert access for edge functions
CREATE POLICY "notification_send_log_service_insert" ON notification_send_log
    FOR INSERT WITH CHECK (true);

COMMENT ON TABLE notification_send_log IS 'Audit log of all sent notifications. Phase 2: reporting and analytics.';

-- ============================================================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_email_config_updated_at ON notification_email_config;
CREATE TRIGGER notification_email_config_updated_at
    BEFORE UPDATE ON notification_email_config
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_timestamp();

DROP TRIGGER IF EXISTS notification_templates_updated_at ON notification_templates;
CREATE TRIGGER notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_timestamp();

DROP TRIGGER IF EXISTS tenant_notification_settings_updated_at ON tenant_notification_settings;
CREATE TRIGGER tenant_notification_settings_updated_at
    BEFORE UPDATE ON tenant_notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_timestamp();

-- ============================================================================
-- 7. SEED DATA: Global Notification Templates
-- ============================================================================

-- Template 1: Welcome Email
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'user.welcome',
    'Welcome Email',
    'Sent to new users when their account is created or they are invited to a tenant',
    'Welcome to LineUp — {{tenant_name}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to LineUp</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 32px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 24px 0; color: #18181b; font-size: 24px; font-weight: 600;">Welcome aboard, {{user_first_name}}!</h2>
                            <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 16px; line-height: 1.6;">You''ve been added to <strong style="color: #18181b;">{{tenant_name}}</strong> on LineUp by {{inviter_name}}.</p>
                            <p style="margin: 0 0 32px 0; color: #3f3f46; font-size: 16px; line-height: 1.6;">LineUp helps your team capture, organize, review, and execute work — all in one place. We''re excited to have you on board!</p>
                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{login_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">Get Started</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{login_url}}/settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "tenant_name": "Organization name", "login_url": "URL to log in", "inviter_name": "Name of person who invited the user"}'::jsonb,
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

-- Template 2: Task Assigned
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'task.assigned',
    'Task Assigned',
    'Sent when a requirement or task is assigned to a user',
    '[LineUp] You have been assigned: {{requirement_title}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Assigned</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 24px 40px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 8px 0; color: #71717a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">New Assignment</p>
                            <h2 style="margin: 0 0 24px 0; color: #18181b; font-size: 22px; font-weight: 600; line-height: 1.3;">{{requirement_title}}</h2>

                            <!-- Info Cards -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                <tr>
                                    <td style="padding: 16px; background-color: #fafafa; border-radius: 6px; border-left: 3px solid #0f62fe;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td style="padding-bottom: 12px;">
                                                    <span style="color: #71717a; font-size: 13px;">Project</span><br>
                                                    <span style="color: #18181b; font-size: 15px; font-weight: 500;">{{project_name}}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding-bottom: 12px;">
                                                    <span style="color: #71717a; font-size: 13px;">Assigned by</span><br>
                                                    <span style="color: #18181b; font-size: 15px; font-weight: 500;">{{assigned_by}}</span>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <span style="color: #71717a; font-size: 13px;">Due Date</span><br>
                                                    <span style="color: #18181b; font-size: 15px; font-weight: 500;">{{due_date}}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{task_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View Task</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{task_url}}/../../settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "requirement_title": "Task/requirement name", "project_name": "Parent project name", "assigned_by": "Name of person who made the assignment", "due_date": "Due date if set", "task_url": "Direct URL to the task", "tenant_name": "Organization name"}'::jsonb,
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

-- Template 3: Daily Summary
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'daily.summary',
    'End of Day Daily Summary',
    'Sent at end of day with a summary of the user''s open and due tasks',
    '[LineUp] Your Daily Summary — {{summary_date}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Summary</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 24px 40px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 8px 0; color: #18181b; font-size: 22px; font-weight: 600;">Good evening, {{user_first_name}}</h2>
                            <p style="margin: 0 0 32px 0; color: #71717a; font-size: 15px;">Here''s your daily summary for {{summary_date}}</p>

                            <!-- Stats Row -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                <tr>
                                    <td width="33%" style="text-align: center; padding: 20px 10px; background-color: #fef2f2; border-radius: 8px 0 0 8px;">
                                        <p style="margin: 0 0 4px 0; color: #dc2626; font-size: 32px; font-weight: 700;">{{overdue_count}}</p>
                                        <p style="margin: 0; color: #991b1b; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Overdue</p>
                                    </td>
                                    <td width="34%" style="text-align: center; padding: 20px 10px; background-color: #fefce8;">
                                        <p style="margin: 0 0 4px 0; color: #ca8a04; font-size: 32px; font-weight: 700;">{{due_today_count}}</p>
                                        <p style="margin: 0; color: #854d0e; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Due Today</p>
                                    </td>
                                    <td width="33%" style="text-align: center; padding: 20px 10px; background-color: #eff6ff; border-radius: 0 8px 8px 0;">
                                        <p style="margin: 0 0 4px 0; color: #2563eb; font-size: 32px; font-weight: 700;">{{in_progress_count}}</p>
                                        <p style="margin: 0; color: #1e40af; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">In Progress</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{dashboard_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View My Work</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{dashboard_url}}/settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "summary_date": "Date of summary", "overdue_count": "Number of overdue items", "due_today_count": "Number of items due today", "in_progress_count": "Number of in-progress items", "dashboard_url": "URL to dashboard", "tenant_name": "Organization name"}'::jsonb,
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

-- Template 4: Weekly Summary
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'weekly.summary',
    'Weekly Summary',
    'Sent weekly with a summary of progress, completions, and upcoming work',
    '[LineUp] Your Weekly Summary — Week of {{week_start_date}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Summary</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 24px 40px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 8px 0; color: #18181b; font-size: 22px; font-weight: 600;">Weekly Recap, {{user_first_name}}</h2>
                            <p style="margin: 0 0 32px 0; color: #71717a; font-size: 15px;">Week of {{week_start_date}} — Here''s how your week shaped up</p>

                            <!-- Stats Row -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                    <td width="33%" style="text-align: center; padding: 20px 10px; background-color: #f0fdf4; border-radius: 8px 0 0 8px;">
                                        <p style="margin: 0 0 4px 0; color: #16a34a; font-size: 32px; font-weight: 700;">{{completed_count}}</p>
                                        <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Completed</p>
                                    </td>
                                    <td width="34%" style="text-align: center; padding: 20px 10px; background-color: #fef2f2;">
                                        <p style="margin: 0 0 4px 0; color: #dc2626; font-size: 32px; font-weight: 700;">{{overdue_count}}</p>
                                        <p style="margin: 0; color: #991b1b; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Overdue</p>
                                    </td>
                                    <td width="33%" style="text-align: center; padding: 20px 10px; background-color: #f5f3ff; border-radius: 0 8px 8px 0;">
                                        <p style="margin: 0 0 4px 0; color: #7c3aed; font-size: 32px; font-weight: 700;">{{upcoming_count}}</p>
                                        <p style="margin: 0; color: #5b21b6; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Upcoming</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 32px 0; color: #3f3f46; font-size: 15px; line-height: 1.6; text-align: center;">Great progress this week! Keep the momentum going into next week.</p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{dashboard_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">See This Week''s Work</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{dashboard_url}}/settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "week_start_date": "Start date of the week", "completed_count": "Tasks completed this week", "overdue_count": "Currently overdue", "upcoming_count": "Due in the next 7 days", "dashboard_url": "URL to dashboard", "tenant_name": "Organization name"}'::jsonb,
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

-- Template 5: New Discussion Post
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'discussion.post',
    'New Discussion Post',
    'Sent when a new discussion post is created on a record the user follows or is assigned to',
    '[LineUp] New discussion on {{record_title}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Discussion</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 24px 40px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.5;">Hi {{user_first_name}},</p>
                            <p style="margin: 0 0 24px 0; color: #3f3f46; font-size: 15px; line-height: 1.5;"><strong style="color: #18181b;">{{poster_name}}</strong> started a new discussion:</p>

                            <!-- Record Info -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 16px; background-color: #fafafa; border-radius: 6px;">
                                        <span style="display: inline-block; padding: 4px 10px; background-color: #e0e7ff; color: #3730a3; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 4px; margin-bottom: 8px;">{{record_type}}</span>
                                        <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 600;">{{record_title}}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Post Excerpt -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                <tr>
                                    <td style="padding: 16px 20px; border-left: 3px solid #0f62fe; background-color: #f8fafc;">
                                        <p style="margin: 0; color: #3f3f46; font-size: 15px; line-height: 1.6; font-style: italic;">{{post_excerpt}}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{discussion_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View Discussion</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{discussion_url}}/../../settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "poster_name": "Name of person who posted", "record_title": "Title of the record (project, requirement, etc.)", "record_type": "Type of record", "post_excerpt": "First 200 characters of the post", "discussion_url": "Direct URL to the discussion", "tenant_name": "Organization name"}'::jsonb,
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

-- Template 6: Discussion Reply
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'discussion.reply',
    'Discussion Reply',
    'Sent when someone replies to a discussion thread the user is participating in',
    '[LineUp] {{replier_name}} replied to a discussion on {{record_title}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discussion Reply</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background-color: #0f62fe; padding: 24px 40px;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">LineUp</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="margin: 0 0 16px 0; color: #3f3f46; font-size: 15px; line-height: 1.5;">Hi {{user_first_name}},</p>
                            <p style="margin: 0 0 24px 0; color: #3f3f46; font-size: 15px; line-height: 1.5;"><strong style="color: #18181b;">{{replier_name}}</strong> replied to a discussion you''re following:</p>

                            <!-- Thread Context -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 24px;">
                                <tr>
                                    <td style="padding: 16px; background-color: #fafafa; border-radius: 6px;">
                                        <p style="margin: 0 0 4px 0; color: #71717a; font-size: 13px;">Discussion on</p>
                                        <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 600;">{{record_title}}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Reply Excerpt -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                                <tr>
                                    <td style="padding: 16px 20px; border-left: 3px solid #16a34a; background-color: #f0fdf4;">
                                        <p style="margin: 0; color: #3f3f46; font-size: 15px; line-height: 1.6;">{{reply_excerpt}}</p>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{discussion_url}}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600;">View Reply</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5; text-align: center;">You are receiving this because you are a member of {{tenant_name}} on LineUp.<br>To manage your notifications, visit your <a href="{{discussion_url}}/../../settings" style="color: #0f62fe; text-decoration: none;">settings</a>.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"user_first_name": "Recipient''s first name", "replier_name": "Name of person who replied", "record_title": "Title of the record", "reply_excerpt": "First 200 characters of the reply", "discussion_url": "Direct URL to the discussion", "tenant_name": "Organization name"}'::jsonb,
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

-- ============================================================================
-- 8. INSERT DEFAULT EMAIL CONFIG (if not exists)
-- ============================================================================
INSERT INTO notification_email_config (from_name, from_email, provider, is_active)
VALUES ('LineUp', 'noreply@lineup.app', 'resend', true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. GRANT TABLE ACCESS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON notification_email_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON tenant_notification_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON notification_subscriptions TO authenticated;
GRANT SELECT, INSERT ON notification_send_log TO authenticated;
GRANT ALL ON notification_send_log TO service_role;

-- ============================================================================
-- 10. REFRESH SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION QUERIES (run manually to verify)
-- ============================================================================
-- SELECT count(*) FROM notification_templates; -- Should return 6
-- SELECT trigger_key FROM notification_templates ORDER BY trigger_key;
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'notification%';
