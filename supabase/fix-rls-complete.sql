-- Complete RLS Fix for tenant_users
-- ====================================================
-- This fixes the circular dependency issue where:
-- - To check if user is sys_admin, we need to query tenant_users
-- - But tenant_users RLS policy checks if user is sys_admin
-- - This creates an infinite loop that returns empty results
--
-- SOLUTION: Use two separate policies
-- 1. Users can ALWAYS read their own records (user_id = auth.uid())
-- 2. Users can read other records in tenants they belong to
-- ====================================================

-- First, drop ALL existing select policies on tenant_users
DROP POLICY IF EXISTS "Users can view tenant users in their tenants" ON tenant_users;
DROP POLICY IF EXISTS "Users can view own tenant memberships" ON tenant_users;

-- Policy 1: Users can always read their own tenant_users records
-- This has NO subquery - it just checks user_id directly
-- This breaks the circular dependency for role checks
CREATE POLICY "Users can read own memberships" ON tenant_users
    FOR SELECT USING (user_id = auth.uid());

-- Policy 2: Users can read other users in tenants they belong to
-- Note: This still works because policy 1 allows reading own records first
CREATE POLICY "Users can read tenant members" ON tenant_users
    FOR SELECT USING (
        tenant_id IN (
            SELECT tu.tenant_id
            FROM tenant_users tu
            WHERE tu.user_id = auth.uid()
        )
    );

-- Verify the policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'tenant_users' AND schemaname = 'public'
ORDER BY policyname;

-- Test: Check if the current user can see their own records
-- (Run this after logging in to verify)
-- SELECT * FROM tenant_users WHERE user_id = auth.uid();
