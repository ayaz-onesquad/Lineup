-- Migration 031: Fix User Creation RLS Policies
-- Fixes:
-- 1. Consolidates conflicting RLS policies from migrations 018 and 025
-- 2. Adds helper function is_org_admin_of_tenant() for cleaner policy checks
-- 3. Ensures OrgAdmin can create users in their tenant without RLS errors
-- 4. Ensures SysAdmin can create users in any tenant

-- ============================================================================
-- 1. Create helper function to check if user is org_admin of a SPECIFIC tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_org_admin_of_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND tenant_id = p_tenant_id
        AND role = 'org_admin'
        AND status = 'active'
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_org_admin_of_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin_of_tenant(UUID) TO service_role;

-- ============================================================================
-- 2. Drop ALL existing potentially conflicting policies on user_profiles
-- ============================================================================
DROP POLICY IF EXISTS "user_profiles_insert_policy" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_policy" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_tenant_select_policy" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_policy" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;

-- ============================================================================
-- 3. Create clean, consolidated user_profiles policies
-- ============================================================================

-- SELECT: Users see their own profile, profiles in same tenant(s), or sys_admin sees all
CREATE POLICY "user_profiles_select_v2" ON user_profiles
    FOR SELECT
    USING (
        -- Users can see their own profile
        user_id = auth.uid()
        -- OR profiles of users in the same tenant(s)
        OR user_id IN (
            SELECT tu2.user_id
            FROM tenant_users tu1
            JOIN tenant_users tu2 ON tu1.tenant_id = tu2.tenant_id
            WHERE tu1.user_id = auth.uid()
        )
        -- OR sys_admin can see all
        OR public.is_sys_admin()
    );

-- INSERT: Users can create own profile, SysAdmin any, OrgAdmin for new tenant users
CREATE POLICY "user_profiles_insert_v2" ON user_profiles
    FOR INSERT
    WITH CHECK (
        -- Users can create their own profile
        auth.uid() = user_id
        -- SysAdmin can create any profile
        OR public.is_sys_admin()
        -- OrgAdmin can create profiles (tenant enforcement is done at tenant_users level)
        OR public.is_org_admin()
    );

-- UPDATE: Users can update own profile, SysAdmin can update any
CREATE POLICY "user_profiles_update_v2" ON user_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR public.is_sys_admin()
        -- OrgAdmin can update profiles in their tenant
        OR user_id IN (
            SELECT tu2.user_id
            FROM tenant_users tu1
            JOIN tenant_users tu2 ON tu1.tenant_id = tu2.tenant_id
            WHERE tu1.user_id = auth.uid()
            AND tu1.role IN ('org_admin')
            AND tu1.status = 'active'
        )
    );

-- ============================================================================
-- 4. Drop ALL existing potentially conflicting policies on tenant_users
-- ============================================================================
DROP POLICY IF EXISTS "org_admin_insert_tenant_users" ON tenant_users;
DROP POLICY IF EXISTS "sys_admin_insert_tenant_users" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_insert_policy" ON tenant_users;

-- ============================================================================
-- 5. Create clean, consolidated tenant_users INSERT policy
-- ============================================================================

-- INSERT: SysAdmin any tenant, OrgAdmin only their own tenant
CREATE POLICY "tenant_users_insert_v2" ON tenant_users
    FOR INSERT
    WITH CHECK (
        -- SysAdmin can insert into any tenant
        public.is_sys_admin()
        -- OrgAdmin can only insert into tenants where they are org_admin
        OR public.is_org_admin_of_tenant(tenant_id)
    );

-- ============================================================================
-- 6. Ensure UPDATE and DELETE policies exist for tenant_users (for role changes)
-- ============================================================================
DROP POLICY IF EXISTS "tenant_users_update_policy" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_delete_policy" ON tenant_users;

-- UPDATE: SysAdmin any, OrgAdmin their tenant only
CREATE POLICY "tenant_users_update_v2" ON tenant_users
    FOR UPDATE
    USING (
        public.is_sys_admin()
        OR public.is_org_admin_of_tenant(tenant_id)
    );

-- DELETE: SysAdmin any, OrgAdmin their tenant only
CREATE POLICY "tenant_users_delete_v2" ON tenant_users
    FOR DELETE
    USING (
        public.is_sys_admin()
        OR public.is_org_admin_of_tenant(tenant_id)
    );

-- ============================================================================
-- 7. Comments
-- ============================================================================
COMMENT ON FUNCTION public.is_org_admin_of_tenant(UUID) IS 'Returns true if current user is org_admin of the specified tenant';
COMMENT ON POLICY "user_profiles_select_v2" ON user_profiles IS 'Users see own profile, same-tenant profiles, or sys_admin sees all';
COMMENT ON POLICY "user_profiles_insert_v2" ON user_profiles IS 'Users create own profile, sys_admin/org_admin can create any';
COMMENT ON POLICY "user_profiles_update_v2" ON user_profiles IS 'Users update own profile, sys_admin/org_admin can update tenant users';
COMMENT ON POLICY "tenant_users_insert_v2" ON tenant_users IS 'SysAdmin any tenant, OrgAdmin only their tenant';
COMMENT ON POLICY "tenant_users_update_v2" ON tenant_users IS 'SysAdmin any tenant, OrgAdmin only their tenant';
COMMENT ON POLICY "tenant_users_delete_v2" ON tenant_users IS 'SysAdmin any tenant, OrgAdmin only their tenant';
