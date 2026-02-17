-- Migration 039: Fix tenant_users RLS infinite recursion
-- The policy added in 038 causes infinite recursion because it queries tenant_users
-- inside a policy on tenant_users. We need to use SECURITY DEFINER helper functions
-- that bypass RLS to check tenant membership.

-- ============================================================================
-- 1. Create helper function to get user's tenant IDs (bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
    AND status = 'active'
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO service_role;

-- ============================================================================
-- 2. Drop the recursive policy
-- ============================================================================
DROP POLICY IF EXISTS "users_view_same_tenant_users" ON tenant_users;

-- ============================================================================
-- 3. Create fixed policy using the SECURITY DEFINER helper function
-- ============================================================================
CREATE POLICY "users_view_same_tenant_users" ON tenant_users
    FOR SELECT
    USING (
        -- Users can see tenant_users in tenants they belong to
        tenant_id IN (SELECT public.get_user_tenant_ids())
        -- Note: sys_admin already handled by "sys_admin_view_all_tenant_users" policy
    );

-- ============================================================================
-- 4. Recreate is_sys_admin function to ensure it's SECURITY DEFINER
-- (The function should already be SECURITY DEFINER but let's make sure)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_sys_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND role = 'sys_admin'
        AND status = 'active'
    )
$$;

-- ============================================================================
-- 5. Add comments
-- ============================================================================
COMMENT ON FUNCTION public.get_user_tenant_ids() IS
    'Returns tenant IDs that the current user belongs to. SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON POLICY "users_view_same_tenant_users" ON tenant_users IS
    'Allows users to view tenant_users records for tenants they are members of. Uses get_user_tenant_ids() to avoid RLS recursion.';
