-- Migration 071: Tasks on Leads, and the website lead notification
--
-- 1. A requirement (task) can belong to a Lead instead of a Client. `sales_lead_id` links it
--    (the existing `lead_id` column means the team member leading the work, a user). Every
--    requirement still has a parent: a client, a lead, or both.
-- 2. A lead's tasks stay in the lead's tenant (checked by trigger).
-- 3. A `lead.website` notification template, sent by website-lead-intake to the tenant's chosen
--    address when a website request arrives.
--
-- Every view over requirements already LEFT JOINs clients, so tasks without a client keep showing
-- in My Work, global tasks and past-due lists. Safe to run more than once.

-- ============================================================================
-- 1. requirements.sales_lead_id, and client_id optional when a lead is set
-- ============================================================================
ALTER TABLE requirements
  ADD COLUMN IF NOT EXISTS sales_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requirements_sales_lead_id
  ON requirements(sales_lead_id) WHERE sales_lead_id IS NOT NULL;

ALTER TABLE requirements ALTER COLUMN client_id DROP NOT NULL;

-- Migration 015 required a client on every requirement (requirements_client_or_set_check);
-- requirements_parent_check below replaces it.
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_client_or_set_check;
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_parent_check;
ALTER TABLE requirements
  ADD CONSTRAINT requirements_parent_check
  CHECK (client_id IS NOT NULL OR sales_lead_id IS NOT NULL);

COMMENT ON COLUMN requirements.sales_lead_id IS
  'The Lead (sales pipeline) this task belongs to, when it is not (yet) under a Client. Not to be confused with lead_id, the user leading the work.';

-- ============================================================================
-- 2. A lead's tasks must be in the lead's tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.requirements_sales_lead_same_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sales_lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM leads l WHERE l.id = NEW.sales_lead_id AND l.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'The lead for this task belongs to a different tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requirements_sales_lead_same_tenant_trg ON requirements;
CREATE TRIGGER requirements_sales_lead_same_tenant_trg
  BEFORE INSERT OR UPDATE OF sales_lead_id, tenant_id ON requirements
  FOR EACH ROW EXECUTE FUNCTION public.requirements_sales_lead_same_tenant();

-- ============================================================================
-- 3. lead.website notification template
-- ============================================================================
INSERT INTO notification_templates (trigger_key, name, description, subject, html_body, available_variables, is_system, is_active)
VALUES (
    'lead.website',
    'New Website Request',
    'Sent to the tenant''s chosen address when a request arrives from its website (free mock-up or question)',
    '{{subject_line}}',
    '<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New website request</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #0f62fe; padding: 28px 40px;">
                            <p style="margin: 0; color: #dbe7ff; font-size: 14px; font-weight: 600;">{{tenant_name}} · {{site}}</p>
                            <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">{{request_kind}}</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 40px;">
                            <h2 style="margin: 0 0 4px; color: #18181b; font-size: 22px; font-weight: 600;">{{business}}</h2>
                            <p style="margin: 0 0 24px; color: #52525b; font-size: 15px;">{{contact_name}} · <a href="mailto:{{email}}" style="color: #0f62fe; text-decoration: none;">{{email}}</a> · {{phone}}</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 15px; color: #3f3f46; line-height: 1.5;">
                                <tr><td style="padding: 6px 0; width: 150px; color: #71717a;">What they need</td><td style="padding: 6px 0;">{{needs}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Mock-up due</td><td style="padding: 6px 0;">{{mockup_due}}</td></tr>
                                <tr><td style="padding: 6px 0; color: #71717a;">Task</td><td style="padding: 6px 0;">{{task_line}}</td></tr>
                            </table>
                            <p style="margin: 24px 0 6px; color: #71717a; font-size: 14px;">Their message</p>
                            <p style="margin: 0 0 24px; color: #18181b; font-size: 15px; line-height: 1.6; white-space: pre-line;">{{message}}</p>
                            <p style="margin: 0 0 6px; color: #71717a; font-size: 14px;">Estimate from the calculator</p>
                            <p style="margin: 0 0 32px; color: #18181b; font-size: 14px; line-height: 1.6; white-space: pre-line;">{{estimate}}</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
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
                            <p style="margin: 0; color: #71717a; font-size: 13px;">To answer {{contact_name}}, write to {{email}} or open the lead in LineUp.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>',
    '{"subject_line": "Email subject", "request_kind": "Free mock-up request or Question", "tenant_name": "Organization name", "site": "Website the request came from", "business": "Business name", "contact_name": "Their name", "email": "Their email", "phone": "Their phone or Not given", "needs": "What they picked", "mockup_due": "When the free mock-up is due, or Not a mock-up request", "task_line": "The task created for it, or No task", "message": "Their message", "estimate": "The calculator estimate, or None", "lead_url": "Link to the lead in LineUp"}'::jsonb,
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
