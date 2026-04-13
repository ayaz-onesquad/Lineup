-- Migration 058: Add RPC function to update user role
-- The tenant_users UPDATE policy causes infinite recursion when directly updating.
-- This SECURITY DEFINER function bypasses RLS to allow role updates by OrgAdmins.

-- ============================================================================
-- 1. Create helper function to check if user is org_admin for a tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_org_admin_for_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND tenant_id = p_tenant_id
        AND role IN ('org_admin', 'sys_admin')
        AND status = 'active'
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_org_admin_for_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin_for_tenant(UUID) TO service_role;

-- ============================================================================
-- 2. Create RPC function to update user role (SECURITY DEFINER bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_tenant_user_role(
    p_tenant_id UUID,
    p_user_id UUID,
    p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate role - OrgAdmins can only assign org_user or org_admin (NOT sys_admin or client_user via this function)
    IF p_role NOT IN ('org_user', 'org_admin') THEN
        RAISE EXCEPTION 'Invalid role. OrgAdmins can only assign org_user or org_admin roles.';
    END IF;

    -- Check if caller is org_admin or sys_admin for this tenant
    IF NOT public.is_org_admin_for_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Permission denied. You must be an Org Admin to update user roles.';
    END IF;

    -- Prevent demoting yourself if you're the only org_admin
    IF p_role = 'org_user' AND p_user_id = auth.uid() THEN
        IF (SELECT COUNT(*) FROM tenant_users
            WHERE tenant_id = p_tenant_id
            AND role = 'org_admin'
            AND status = 'active') <= 1 THEN
            RAISE EXCEPTION 'Cannot demote yourself. You are the only Org Admin for this tenant.';
        END IF;
    END IF;

    -- Perform the update
    UPDATE tenant_users
    SET role = p_role,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found in this tenant.';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_tenant_user_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_user_role(UUID, UUID, TEXT) TO service_role;

-- ============================================================================
-- 3. Add comments
-- ============================================================================
COMMENT ON FUNCTION public.is_org_admin_for_tenant(UUID) IS
    'Checks if the current user is an org_admin or sys_admin for a specific tenant. SECURITY DEFINER to avoid RLS recursion.';

COMMENT ON FUNCTION public.update_tenant_user_role(UUID, UUID, TEXT) IS
    'Updates a user role within a tenant. Only org_admin/sys_admin can call this. Only allows assigning org_user or org_admin roles.';
