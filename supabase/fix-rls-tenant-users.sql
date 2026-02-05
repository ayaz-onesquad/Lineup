-- Fix RLS Policy Circular Dependency on tenant_users
-- ====================================================
-- PROBLEM: The current policy requires checking if user is sys_admin,
-- but to check that, we need to read tenant_users, which requires the policy check.
-- This creates a deadlock that returns empty results.
--
-- SOLUTION: Add a policy that lets users read their OWN records directly.
-- ====================================================

-- Drop the existing problematic policy
DROP POLICY IF EXISTS "Users can view tenant users in their tenants" ON tenant_users;

-- Create a policy that lets users read their own tenant_users records
-- This breaks the circular dependency
CREATE POLICY "Users can view own tenant memberships" ON tenant_users
    FOR SELECT USING (user_id = auth.uid());

-- Create a separate policy for viewing other users in the same tenant
-- This runs AFTER the user can read their own records
CREATE POLICY "Users can view tenant users in their tenants" ON tenant_users
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users tu WHERE tu.user_id = auth.uid())
    );

-- Verify the policies were created
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename = 'tenant_users' AND schemaname = 'public';
