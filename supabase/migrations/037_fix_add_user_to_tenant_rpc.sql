-- Migration 037: Fix add_user_to_tenant RPC function
-- Removes invalid user_role type cast (the type doesn't exist, role is TEXT)

-- ============================================================================
-- 1. Replace the function without the invalid type cast
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

    -- Validate role is one of the allowed values
    IF p_role NOT IN ('sys_admin', 'org_admin', 'org_user', 'client_user') THEN
        RAISE EXCEPTION 'Invalid role: %. Must be sys_admin, org_admin, org_user, or client_user', p_role;
    END IF;

    -- Check if user is already in this tenant
    IF EXISTS (
        SELECT 1 FROM tenant_users
        WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is already a member of this tenant';
    END IF;

    -- Insert the tenant_user record (no type cast - role column is TEXT)
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (p_tenant_id, p_user_id, p_role, p_status)
    RETURNING id INTO v_tenant_user_id;

    RETURN v_tenant_user_id;
END;
$$;

-- ============================================================================
-- 2. Update comment
-- ============================================================================
COMMENT ON FUNCTION public.add_user_to_tenant(UUID, UUID, TEXT, TEXT) IS
    'Adds a user to a tenant with specified role. Only callable by sys_admin or org_admin of the tenant. Role must be one of: sys_admin, org_admin, org_user, client_user.';
