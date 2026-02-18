-- Migration 041: Fix tenant_users RLS with fallback self-read policy
--
-- ISSUE: OrgAdmin users seeing empty team list in production
-- ROOT CAUSE: The policy "users_view_same_tenant_users" relies solely on
-- get_user_tenant_ids() which may fail to return results if there are any
-- issues with auth.uid() or the SECURITY DEFINER function execution context.
--
-- SOLUTION: Add a direct self-read policy that always allows users to see
-- their own tenant_users records. This breaks any potential circular dependency.

-- ============================================================================
-- 1. Add self-read policy for tenant_users
-- ============================================================================
-- Users can always read their own tenant membership records
DROP POLICY IF EXISTS "users_view_own_tenant_memberships" ON tenant_users;
CREATE POLICY "users_view_own_tenant_memberships" ON tenant_users
    FOR SELECT
    USING (user_id = auth.uid());

-- ============================================================================
-- 2. Ensure the users_view_same_tenant_users policy exists with correct logic
-- ============================================================================
-- This allows users to see OTHER users in tenants they belong to
DROP POLICY IF EXISTS "users_view_same_tenant_users" ON tenant_users;
CREATE POLICY "users_view_same_tenant_users" ON tenant_users
    FOR SELECT
    USING (
        -- User can see tenant_users in tenants they belong to
        -- Uses SECURITY DEFINER function to bypass RLS recursion
        tenant_id IN (SELECT public.get_user_tenant_ids())
    );

-- ============================================================================
-- 3. Verify get_user_tenant_ids function exists and is correct
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

GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_ids() TO service_role;

-- ============================================================================
-- 4. Comments
-- ============================================================================
COMMENT ON POLICY "users_view_own_tenant_memberships" ON tenant_users IS
    'Fallback policy: Users can always read their own tenant_users records directly via user_id match.';

COMMENT ON POLICY "users_view_same_tenant_users" ON tenant_users IS
    'Users can view other tenant_users records in tenants they are members of.';
