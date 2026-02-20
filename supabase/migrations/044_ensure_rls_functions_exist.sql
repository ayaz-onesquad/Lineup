-- Migration 044: Ensure RLS helper functions exist and work correctly
--
-- This migration explicitly recreates the SECURITY DEFINER helper functions
-- to ensure they exist in production. This is safe because CREATE OR REPLACE
-- is idempotent - it only updates if there's a difference.
--
-- This also forces a schema cache reload to ensure PostgREST picks up changes.

-- ============================================================================
-- 1. RECREATE get_user_tenant_ids() - Returns tenant IDs for current user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
    AND status = 'active'
$$;

-- Ensure grants exist
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO anon;

-- ============================================================================
-- 2. RECREATE is_sys_admin() - Check if current user is a sys_admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_sys_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND role = 'sys_admin'
        AND status = 'active'
    )
$$;

-- Ensure grants exist
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO anon;

-- ============================================================================
-- 3. RECREATE user_has_role_in_tenant() - Check role in specific tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_has_role_in_tenant(
    p_tenant_id UUID,
    required_roles text[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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

-- Ensure grants exist
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) TO anon;

-- ============================================================================
-- 4. RE-APPLY CLIENTS RLS POLICIES (to ensure they use the helper functions)
-- ============================================================================
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;

CREATE POLICY "clients_select_policy" ON clients
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_insert_policy" ON clients
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_update_policy" ON clients
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_delete_policy" ON clients
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 5. RE-APPLY LEADS RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "leads_select_policy" ON leads;
DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
DROP POLICY IF EXISTS "leads_update_policy" ON leads;
DROP POLICY IF EXISTS "leads_delete_policy" ON leads;

CREATE POLICY "leads_select_policy" ON leads
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

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
-- 6. RE-APPLY CONTACTS RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "contacts_select_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_update_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_policy" ON contacts;

CREATE POLICY "contacts_select_policy" ON contacts
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_insert_policy" ON contacts
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_update_policy" ON contacts
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_delete_policy" ON contacts
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 7. RE-APPLY LEAD_CONTACTS RLS POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "lead_contacts_select_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_insert_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_update_policy" ON lead_contacts;
DROP POLICY IF EXISTS "lead_contacts_delete_policy" ON lead_contacts;

CREATE POLICY "lead_contacts_select_policy" ON lead_contacts
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

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
-- 8. FORCE SCHEMA CACHE RELOAD
-- ============================================================================
-- PostgREST caches the schema; this forces a reload
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 9. COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.get_user_tenant_ids() IS
    'Returns tenant IDs for the current authenticated user. SECURITY DEFINER to bypass RLS recursion.';

COMMENT ON FUNCTION public.is_sys_admin() IS
    'Checks if current user is a sys_admin in any tenant. SECURITY DEFINER to bypass RLS recursion.';

COMMENT ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) IS
    'Checks if current user has any of the specified roles in a specific tenant. SECURITY DEFINER to bypass RLS recursion.';
