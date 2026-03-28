-- Migration 054: Lead Automations with pg_cron scheduling
-- Purpose: Create lead_automations table and scheduled job to run automations via Apify

-- MANUAL SETUP REQUIRED after running this migration:
-- In Supabase SQL Editor, run:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
-- These are set once and persist. Find them in Supabase Dashboard -> Project Settings -> API

-- ============================================================================
-- 1. Create lead_automations table
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_id SERIAL,

    -- Configuration
    name VARCHAR(255) NOT NULL,
    description TEXT,
    search_query VARCHAR(500) NOT NULL,
    location VARCHAR(255) NOT NULL,
    max_leads INTEGER NOT NULL DEFAULT 20,

    -- Filters
    filter_no_website BOOLEAN DEFAULT TRUE,
    filter_website_required BOOLEAN DEFAULT FALSE,
    filter_min_rating NUMERIC(2,1),
    filter_category VARCHAR(255),

    -- Scheduling
    frequency VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (frequency IN ('manual', 'daily', 'weekly', 'monthly')),
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_leads_generated INTEGER NOT NULL DEFAULT 0,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_automations_tenant ON lead_automations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_automations_active ON lead_automations(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_automations_next_run ON lead_automations(next_run_at) WHERE is_active = TRUE AND deleted_at IS NULL;

-- Updated_at trigger
DROP TRIGGER IF EXISTS lead_automations_updated_at_trigger ON lead_automations;
CREATE TRIGGER lead_automations_updated_at_trigger
    BEFORE UPDATE ON lead_automations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. Create automation_runs log table
-- ============================================================================
CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES lead_automations(id) ON DELETE CASCADE,

    -- Run details
    trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('manual', 'scheduled')),
    triggered_by UUID REFERENCES auth.users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Results
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'partial')),
    leads_found INTEGER DEFAULT 0,
    leads_created INTEGER DEFAULT 0,
    leads_skipped INTEGER DEFAULT 0,
    error_message TEXT,

    -- Raw response (for debugging)
    apify_run_id VARCHAR(100),
    raw_response JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_tenant ON automation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started_at DESC);

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================
ALTER TABLE lead_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

-- Lead automations policies
CREATE POLICY "lead_automations_select_policy" ON lead_automations
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_automations_insert_policy" ON lead_automations
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_automations_update_policy" ON lead_automations
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_automations_delete_policy" ON lead_automations
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- Automation runs policies
CREATE POLICY "automation_runs_select_policy" ON automation_runs
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "automation_runs_insert_policy" ON automation_runs
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "automation_runs_update_policy" ON automation_runs
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. Enable pg_cron and pg_net extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================================
-- 5. Create helper function for triggering automations
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_due_lead_automations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    automation RECORD;
    edge_fn_url TEXT;
    service_key TEXT;
BEGIN
    -- Build the Edge Function URL from Supabase project URL
    edge_fn_url := current_setting('app.settings.supabase_url', true)
                   || '/functions/v1/run-lead-automation';
    service_key := current_setting('app.settings.service_role_key', true);

    -- Guard: Don't run if settings aren't configured
    IF edge_fn_url IS NULL OR edge_fn_url = '' OR service_key IS NULL OR service_key = '' THEN
        RAISE WARNING 'Lead automation cron: app.settings not configured. Skipping.';
        RETURN;
    END IF;

    -- Find all active automations where next_run_at <= now
    FOR automation IN
        SELECT id, tenant_id
        FROM lead_automations
        WHERE is_active = TRUE
          AND deleted_at IS NULL
          AND frequency != 'manual'
          AND (next_run_at IS NULL OR next_run_at <= NOW())
    LOOP
        -- Call the Edge Function via http extension
        -- The Edge Function handles the actual Apify call and lead creation
        PERFORM net.http_post(
            url := edge_fn_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
                'automation_id', automation.id::text,
                'triggered_by', '00000000-0000-0000-0000-000000000000',
                'trigger_type', 'scheduled'
            )::text
        );

        -- Update next_run_at immediately to prevent double-trigger
        UPDATE lead_automations
        SET next_run_at = CASE frequency
            WHEN 'daily'   THEN NOW() + INTERVAL '1 day'
            WHEN 'weekly'  THEN NOW() + INTERVAL '7 days'
            WHEN 'monthly' THEN NOW() + INTERVAL '30 days'
            ELSE NULL
        END,
        last_run_at = NOW()
        WHERE id = automation.id;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION trigger_due_lead_automations() IS
    'Called by pg_cron hourly. Finds lead automations due to run and triggers the Edge Function for each.';

-- ============================================================================
-- 6. Schedule the hourly cron job
-- ============================================================================
SELECT cron.schedule(
    'check-lead-automations',        -- job name
    '0 * * * *',                     -- every hour at minute 0
    'SELECT trigger_due_lead_automations();'
);

-- ============================================================================
-- 7. Comments
-- ============================================================================
COMMENT ON TABLE lead_automations IS 'Stores lead automation configurations for Apify Google Places scraping';
COMMENT ON TABLE automation_runs IS 'Log of automation executions for audit and debugging';
COMMENT ON COLUMN lead_automations.filter_no_website IS 'When true, only returns businesses WITHOUT a website (target for digital agencies)';
COMMENT ON COLUMN lead_automations.filter_website_required IS 'When true, only returns businesses WITH a website';
COMMENT ON COLUMN lead_automations.frequency IS 'How often to run: manual (on-demand), daily, weekly, or monthly';
COMMENT ON COLUMN lead_automations.next_run_at IS 'When the automation should next be triggered by the cron job';
