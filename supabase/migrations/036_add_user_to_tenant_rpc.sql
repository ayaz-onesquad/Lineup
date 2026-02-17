-- Migration 036: Add RPC function for adding users to tenant
-- This function bypasses RLS to reliably add users to tenant_users
-- Only callable by org_admin of the tenant or sys_admin

-- ============================================================================
-- 1. Create function to add a user to a tenant (bypasses RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_user_to_tenant(
    p_tenant_id UUID,
    p_user_id UUID,
    p_role TEXT DEFAULT 'org_user',
    p_status TEXT DEFAULT 'active'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_user_id UUID;
    v_caller_id UUID;
BEGIN
    -- Get the caller's user ID
    v_caller_id := auth.uid();

    -- Verify caller is authorized (sys_admin or org_admin of this tenant)
    IF NOT (
        EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = v_caller_id
            AND role = 'sys_admin'
            AND status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = v_caller_id
            AND tenant_id = p_tenant_id
            AND role = 'org_admin'
            AND status = 'active'
        )
    ) THEN
        RAISE EXCEPTION 'Permission denied: You must be sys_admin or org_admin of this tenant';
    END IF;

    -- Check if user is already in this tenant
    IF EXISTS (
        SELECT 1 FROM tenant_users
        WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is already a member of this tenant';
    END IF;

    -- Insert the tenant_user record
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (p_tenant_id, p_user_id, p_role::user_role, p_status)
    RETURNING id INTO v_tenant_user_id;

    RETURN v_tenant_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.add_user_to_tenant(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_to_tenant(UUID, UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 2. Add comment
-- ============================================================================
COMMENT ON FUNCTION public.add_user_to_tenant(UUID, UUID, TEXT, TEXT) IS
    'Adds a user to a tenant with specified role. Only callable by sys_admin or org_admin of the tenant.';
