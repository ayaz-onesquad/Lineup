-- Migration 072: Lead notification settings, and an email for every new lead
--
-- 1. lead_intake_settings: per tenant, who hears about new leads (team members and extra
--    addresses) and who website mock-up tasks are assigned to. Read by every member of the
--    tenant, written by its admins (Settings > Leads). The website-lead-intake function reads it
--    with the service role.
-- 2. A `lead.created` notification template.
-- 3. notify_lead_created(): AFTER INSERT on leads, emails the configured recipients through the
--    send-notification Edge Function. Leads from the website form (source_automation_name =
--    'Website form') are skipped: website-lead-intake already sends them `lead.website`.
--
-- SECRETS (Supabase Vault, never in this file). The trigger reads:
--   lineup_supabase_url                  required  e.g. https://zsrtcthepydfxgruagvq.supabase.co
--   lineup_notification_webhook_secret   required  the same value as send-notification's
--                                                  WEBHOOK_SECRET Edge Function secret
--   lineup_supabase_anon_key             optional  the project's public anon key, sent as the
--                                                  bearer for the functions gateway when
--                                                  send-notification verifies JWTs
--   lineup_app_url                       optional  LineUp's address for links (default
--                                                  https://www.lineupco.io)
-- Create them in Dashboard > Integrations > Vault, or with
--   select vault.create_secret('<value>', 'lineup_notification_webhook_secret');
-- Without the required ones the trigger logs a warning and skips the email; the lead is saved.
--
-- Safe to run more than once.

-- ============================================================================
-- 1. lead_intake_settings
-- ============================================================================

-- Every extra address must look like an email; at most 20 of them. (CHECK cannot hold a
-- subquery, so the per-element test lives in an immutable function.)
CREATE OR REPLACE FUNCTION public.lead_intake_emails_valid(emails TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(cardinality(emails), 0) <= 20
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(emails, '{}'::TEXT[])) AS e
       WHERE e IS NULL
          OR length(e) > 254
          OR e !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$'
     );
$$;

CREATE TABLE IF NOT EXISTS lead_intake_settings (
  tenant_id                UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- Team members (user_profiles.id) who get the new-lead email
  notify_user_ids          UUID[] NOT NULL DEFAULT '{}',
  -- Extra addresses that get it too (stored lower-case)
  notify_emails            TEXT[] NOT NULL DEFAULT '{}',
  -- Who website mock-up tasks are assigned to (user_profiles.id); null = the intake user
  mockup_task_assignee_id  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  -- Email for leads created any other way (UI, imports, automations). Website requests are
  -- always emailed by the intake function.
  notify_on_new_leads      BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT lead_intake_settings_emails_check CHECK (public.lead_intake_emails_valid(notify_emails)),
  CONSTRAINT lead_intake_settings_users_check CHECK (cardinality(notify_user_ids) <= 50)
);

COMMENT ON TABLE lead_intake_settings IS
  'Per tenant: who is emailed about new leads and who website mock-up tasks are assigned to (migration 072).';

-- Normalise and validate: addresses lower-cased and de-duplicated; every user and the assignee
-- must be an active member of the tenant (a profile from another tenant would leak the lead).
CREATE OR REPLACE FUNCTION public.lead_intake_settings_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.notify_emails := COALESCE((
    SELECT array_agg(DISTINCT lower(trim(e)) ORDER BY lower(trim(e)))
    FROM unnest(NEW.notify_emails) AS e
    WHERE trim(e) <> ''
  ), '{}');

  NEW.notify_user_ids := COALESCE((
    SELECT array_agg(DISTINCT u) FROM unnest(NEW.notify_user_ids) AS u WHERE u IS NOT NULL
  ), '{}');

  IF EXISTS (
    SELECT 1 FROM unnest(NEW.notify_user_ids) AS u
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_profiles up
      JOIN tenant_users tu ON tu.user_id = up.user_id
      WHERE up.id = u AND tu.tenant_id = NEW.tenant_id AND tu.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Every notified user must be an active member of this organization';
  END IF;

  IF NEW.mockup_task_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM user_profiles up
    JOIN tenant_users tu ON tu.user_id = up.user_id
    WHERE up.id = NEW.mockup_task_assignee_id AND tu.tenant_id = NEW.tenant_id AND tu.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The mock-up task assignee must be an active member of this organization';
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_intake_settings_before_write_trg ON lead_intake_settings;
CREATE TRIGGER lead_intake_settings_before_write_trg
  BEFORE INSERT OR UPDATE ON lead_intake_settings
  FOR EACH ROW EXECUTE FUNCTION public.lead_intake_settings_before_write();

ALTER TABLE lead_intake_settings ENABLE ROW LEVEL SECURITY;

-- Members of the tenant can read; org admins (and SysAdmins) can write. Same shape as
-- tenant_security_settings (migration 068).
DROP POLICY IF EXISTS "lis_select" ON lead_intake_settings;
CREATE POLICY "lis_select" ON lead_intake_settings
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_user_tenant_ids())
    OR public.is_sys_admin()
  );

DROP POLICY IF EXISTS "lis_insert" ON lead_intake_settings;
CREATE POLICY "lis_insert" ON lead_intake_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

DROP POLICY IF EXISTS "lis_update" ON lead_intake_settings;
CREATE POLICY "lis_update" ON lead_intake_settings
  FOR UPDATE TO authenticated
  USING (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  )
  WITH CHECK (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

DROP POLICY IF EXISTS "lis_delete" ON lead_intake_settings;
CREATE POLICY "lis_delete" ON lead_intake_settings
  FOR DELETE TO authenticated
  USING (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON lead_intake_settings TO authenticated;
REVOKE ALL ON lead_intake_settings FROM anon;

-- ============================================================================
-- 2. lead.created notification template
-- ============================================================================
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'lead.created',
    'New Lead',
    'Sent to the addresses chosen in Settings > Leads when a lead is added in LineUp (website requests send New Website Request instead)',
    'New lead: {{lead_name}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New lead</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #0f62fe; padding: 28px 40px;">
                            <p style="margin: 0; color: #dbe7ff; font-size: 14px; font-weight: 600;">{{tenant_name}}</p>
                            <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">New lead</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 40px;">
                            <h2 style="margin: 0 0 24px; color: #18181b; font-size: 22px; font-weight: 600;">{{lead_name}}</h2>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 15px; color: #3f3f46; line-height: 1.5;">
                                <tr><td style="padding: 6px 0; width: 150px; color: #71717a;">Source</td><td style="padding: 6px 0;">{{source}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Email</td><td style="padding: 6px 0;">{{email}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Phone</td><td style="padding: 6px 0;">{{phone}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Estimated value</td><td style="padding: 6px 0;">{{estimated_value}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Owner</td><td style="padding: 6px 0;">{{owner_name}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Added by</td><td style="padding: 6px 0;">{{created_by_name}}</td></tr>
                            </table>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top: 32px;">
                                <tr>
                                    <td style="background-color: #0f62fe; border-radius: 6px;">
                                        <a href="{{lead_url}}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600;">Open the lead in LineUp</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; color: #71717a; font-size: 13px;">You get this because you are on the new-lead list in LineUp (Settings &gt; Leads).</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"lead_name": "Lead name", "tenant_name": "Organization name", "source": "Where the lead came from", "email": "Lead email or Not given", "phone": "Lead phone or Not given", "estimated_value": "Estimated value or Not set", "owner_name": "Lead owner or Unassigned", "created_by_name": "Who added it", "lead_url": "Link to the lead in LineUp"}'::jsonb,
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
-- 3. Email the configured recipients when a lead is added
-- ============================================================================

-- The configured recipients for a tenant: the chosen members' login emails plus the extra
-- addresses, lower-cased and de-duplicated. Used by the trigger below. Not callable by clients.
CREATE OR REPLACE FUNCTION public.lead_notification_recipients(p_tenant_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT addr ORDER BY addr), '{}')
  FROM (
    SELECT lower(au.email) AS addr
    FROM lead_intake_settings s
    CROSS JOIN LATERAL unnest(s.notify_user_ids) AS uid
    JOIN user_profiles up ON up.id = uid
    JOIN tenant_users tu ON tu.user_id = up.user_id AND tu.tenant_id = s.tenant_id AND tu.status = 'active'
    JOIN auth.users au ON au.id = up.user_id
    WHERE s.tenant_id = p_tenant_id AND au.email IS NOT NULL
    UNION
    SELECT lower(e)
    FROM lead_intake_settings s
    CROSS JOIN LATERAL unnest(s.notify_emails) AS e
    WHERE s.tenant_id = p_tenant_id
  ) r
  WHERE addr IS NOT NULL AND addr <> '';
$$;

REVOKE ALL ON FUNCTION public.lead_notification_recipients(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_notification_recipients(UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_lead_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
    v_enabled         BOOLEAN;
    v_recipients      TEXT[];
    v_supabase_url    TEXT;
    v_webhook_secret  TEXT;
    v_anon_key        TEXT;
    v_app_url         TEXT;
    v_headers         JSONB;
    v_tenant_name     TEXT;
    v_owner_name      TEXT;
    v_creator_name    TEXT;
    v_variables       JSONB;
    v_to              TEXT;
BEGIN
    -- Website requests are emailed by website-lead-intake (lead.website)
    IF NEW.source_automation_name = 'Website form' THEN
        RETURN NEW;
    END IF;

    SELECT notify_on_new_leads INTO v_enabled
    FROM lead_intake_settings WHERE tenant_id = NEW.tenant_id;
    IF v_enabled IS NOT TRUE THEN
        RETURN NEW; -- no settings row, or turned off
    END IF;

    v_recipients := public.lead_notification_recipients(NEW.tenant_id);
    IF cardinality(v_recipients) = 0 THEN
        RETURN NEW;
    END IF;

    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets WHERE name = 'lineup_supabase_url';
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets WHERE name = 'lineup_notification_webhook_secret';
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'lineup_supabase_anon_key';
    SELECT decrypted_secret INTO v_app_url
    FROM vault.decrypted_secrets WHERE name = 'lineup_app_url';

    IF v_supabase_url IS NULL OR v_webhook_secret IS NULL THEN
        RAISE WARNING 'notify_lead_created skipped: Vault secrets lineup_supabase_url and lineup_notification_webhook_secret are required';
        RETURN NEW;
    END IF;

    v_app_url := rtrim(COALESCE(NULLIF(v_app_url, ''), 'https://www.lineupco.io'), '/');

    v_headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_webhook_secret
    );
    IF v_anon_key IS NOT NULL AND v_anon_key <> '' THEN
        v_headers := v_headers || jsonb_build_object(
            'Authorization', 'Bearer ' || v_anon_key,
            'apikey', v_anon_key
        );
    END IF;

    SELECT name INTO v_tenant_name FROM tenants WHERE id = NEW.tenant_id;
    SELECT full_name INTO v_owner_name FROM user_profiles WHERE id = NEW.lead_owner_id;
    SELECT full_name INTO v_creator_name FROM user_profiles WHERE user_id = NEW.created_by;

    v_variables := jsonb_build_object(
        'lead_name', COALESCE(NEW.lead_name, 'Untitled lead'),
        'tenant_name', COALESCE(v_tenant_name, 'Your organization'),
        'source', COALESCE(NEW.source_automation_name, initcap(replace(NEW.source, '_', ' ')), 'Not set'),
        'email', COALESCE(NULLIF(NEW.email, ''), 'Not given'),
        'phone', COALESCE(NULLIF(NEW.phone, ''), 'Not given'),
        'estimated_value', COALESCE('$' || to_char(NEW.estimated_value, 'FM999,999,999,990'), 'Not set'),
        'owner_name', COALESCE(v_owner_name, 'Unassigned'),
        'created_by_name', COALESCE(v_creator_name, 'LineUp'),
        'lead_url', v_app_url || '/leads/' || NEW.id::TEXT
    );

    FOREACH v_to IN ARRAY v_recipients LOOP
        -- pg_net queues the request; it does not block the insert
        PERFORM net.http_post(
            v_supabase_url || '/functions/v1/send-notification',
            jsonb_build_object(
                'trigger_key', 'lead.created',
                'tenant_id', NEW.tenant_id,
                'recipient_email', v_to,
                'variables', v_variables
            ),
            '{}'::jsonb,
            v_headers,
            5000
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- A failed email must never block saving the lead
    RAISE WARNING 'notify_lead_created error: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_lead_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_lead_created() FROM anon, authenticated;

DROP TRIGGER IF EXISTS notify_lead_created_trg ON leads;
CREATE TRIGGER notify_lead_created_trg
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_lead_created();
