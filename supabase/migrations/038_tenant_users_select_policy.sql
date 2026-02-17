-- Migration 038: Add SELECT policy for tenant_users
-- Allows users to see other users in the same tenant(s)
-- Previously only sys_admin could view tenant_users records

-- ============================================================================
-- 1. Add SELECT policy for regular users to see tenant_users in their tenant
-- ============================================================================

-- Users can see tenant_users records for tenants they belong to
CREATE POLICY "users_view_same_tenant_users" ON tenant_users
    FOR SELECT
    USING (
        -- Users can see tenant_users in tenants they belong to
        tenant_id IN (
            SELECT tu.tenant_id
            FROM tenant_users tu
            WHERE tu.user_id = auth.uid()
            AND tu.status = 'active'
        )
        -- sys_admin already handled by separate policy (sys_admin_view_all_tenant_users)
    );

-- ============================================================================
-- 2. Add comment
-- ============================================================================
COMMENT ON POLICY "users_view_same_tenant_users" ON tenant_users IS
    'Allows users to view tenant_users records for tenants they are members of';
