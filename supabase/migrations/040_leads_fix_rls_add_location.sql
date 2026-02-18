-- Migration 040: Fix leads RLS and add location fields
-- Issues fixed:
-- 1. RLS INSERT policy queries tenant_users which can cause recursion
-- 2. Add city and state columns for lead location tracking

-- ============================================================================
-- 1. Create helper function for tenant user role check (bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_has_tenant_role(required_roles text[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tenant_users
        WHERE user_id = auth.uid()
        AND status = 'active'
        AND role = ANY(required_roles)
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_has_tenant_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_tenant_role(text[]) TO service_role;

-- ============================================================================
-- 2. Add city and state columns to leads
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address VARCHAR(500);

-- Indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);

-- ============================================================================
-- 3. Fix leads RLS policies to use SECURITY DEFINER functions
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
DROP POLICY IF EXISTS "leads_update_policy" ON leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON leads;
DROP POLICY IF EXISTS "leads_select_policy" ON leads;

-- Recreate with fixed logic using helper functions
CREATE POLICY "leads_select_policy" ON leads
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_insert_policy" ON leads
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_update_policy" ON leads
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_delete_policy" ON leads
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. Fix lead_contacts RLS policies similarly
-- ============================================================================

DROP POLICY IF EXISTS "lead_contacts_insert_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_update_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_delete_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_select_policy" ON lead_contacts;

CREATE POLICY "lead_contacts_select_policy" ON lead_contacts
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_insert_policy" ON lead_contacts
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_update_policy" ON lead_contacts
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_delete_policy" ON lead_contacts
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_tenant_role(ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 5. Comments
-- ============================================================================
COMMENT ON FUNCTION public.user_has_tenant_role(text[]) IS
    'Checks if current user has any of the specified roles in their active tenant memberships. SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON COLUMN leads.city IS 'City where the lead is located';
COMMENT ON COLUMN leads.state IS 'State/Province where the lead is located';
COMMENT ON COLUMN leads.address IS 'Full address of the lead';
