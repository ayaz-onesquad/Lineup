-- Migration 042: Fix leads RLS to check role in specific tenant
--
-- ISSUE: Lead creation fails because user_has_tenant_role() checks roles across
-- ALL tenants instead of the specific tenant being inserted into.
--
-- SOLUTION: Create a new function that checks the role in a specific tenant
-- and update the leads RLS policies to use it.

-- ============================================================================
-- 1. Create helper function to check role in a SPECIFIC tenant (bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_has_role_in_tenant(
    p_tenant_id UUID,
    required_roles text[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tenant_users
        WHERE user_id = auth.uid()
        AND tenant_id = p_tenant_id
        AND status = 'active'
        AND role = ANY(required_roles)
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO service_role;

-- ============================================================================
-- 2. Fix leads RLS policies to check role in the specific tenant
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
DROP POLICY IF EXISTS "leads_update_policy" ON leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON leads;

-- Recreate with correct tenant-specific role check
CREATE POLICY "leads_insert_policy" ON leads
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_update_policy" ON leads
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_delete_policy" ON leads
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 3. Fix lead_contacts RLS policies similarly
-- ============================================================================

DROP POLICY IF EXISTS "lead_contacts_insert_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_update_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_delete_policy" ON lead_contacts;

CREATE POLICY "lead_contacts_insert_policy" ON lead_contacts
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_update_policy" ON lead_contacts
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_delete_policy" ON lead_contacts
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. Comments
-- ============================================================================
COMMENT ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) IS
    'Checks if current user has any of the specified roles in a SPECIFIC tenant. SECURITY DEFINER to avoid RLS recursion.';
