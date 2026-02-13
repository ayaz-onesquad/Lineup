-- Migration 018: SysAdmin RLS Policies and Tenant Deletion Workflow
-- Fixes:
-- 1. RLS violation when SysAdmin creates user profiles
-- 2. Add deleted_at column to tenants table (if missing)
-- 3. Add status column to tenants for deactivation workflow
-- 4. Add helper function for checking sys_admin role

-- ============================================================================
-- 1. Add deleted_at column to tenants table (for soft delete)
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE tenants ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;

-- ============================================================================
-- 2. Create helper function to check if current user is sys_admin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_sys_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND role = 'sys_admin'
        AND status = 'active'
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sys_admin() TO service_role;

-- ============================================================================
-- 3. Update RLS policies for user_profiles to allow SysAdmin operations
-- ============================================================================

-- Drop existing restrictive policies (if they exist)
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create new INSERT policy: Users can insert own profile OR SysAdmin can insert any
CREATE POLICY "user_profiles_insert_policy" ON user_profiles
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        OR public.is_sys_admin()
    );

-- Create new UPDATE policy: Users can update own profile OR SysAdmin can update any
CREATE POLICY "user_profiles_update_policy" ON user_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. Add tenant deactivation function (blocks login for inactive tenants)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deactivate_tenant(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only sys_admin can deactivate tenants
    IF NOT public.is_sys_admin() THEN
        RAISE EXCEPTION 'Only system administrators can deactivate tenants';
    END IF;

    UPDATE tenants
    SET status = 'inactive',
        updated_at = NOW()
    WHERE id = p_tenant_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.deactivate_tenant(UUID) TO authenticated;

-- ============================================================================
-- 5. Add tenant permanent deletion function (hard delete with confirmation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.permanently_delete_tenant(p_tenant_id UUID, p_confirmation_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_name TEXT;
    v_tenant_status TEXT;
BEGIN
    -- Only sys_admin can permanently delete tenants
    IF NOT public.is_sys_admin() THEN
        RAISE EXCEPTION 'Only system administrators can permanently delete tenants';
    END IF;

    -- Get tenant info
    SELECT name, status INTO v_tenant_name, v_tenant_status
    FROM tenants
    WHERE id = p_tenant_id;

    IF v_tenant_name IS NULL THEN
        RAISE EXCEPTION 'Tenant not found';
    END IF;

    -- Tenant must be inactive before permanent deletion
    IF v_tenant_status != 'inactive' THEN
        RAISE EXCEPTION 'Tenant must be deactivated before permanent deletion';
    END IF;

    -- Verify confirmation name matches tenant name (case-insensitive)
    IF LOWER(p_confirmation_name) != LOWER(v_tenant_name) THEN
        RAISE EXCEPTION 'Confirmation name does not match tenant name';
    END IF;

    -- Perform hard delete (cascades will handle related data)
    DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.permanently_delete_tenant(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 6. Add function to check if user can access tenant (blocks inactive tenant login)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM tenants
    WHERE id = p_tenant_id
    AND deleted_at IS NULL;

    -- Return false if tenant is inactive or not found
    RETURN v_status = 'active';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_tenant_access(UUID) TO authenticated;

-- ============================================================================
-- 7. Ensure status column allows 'inactive' value
-- ============================================================================
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;

    -- Add new constraint allowing inactive
    ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
        CHECK (status IN ('active', 'inactive', 'suspended', 'cancelled'));
EXCEPTION
    WHEN others THEN
        -- Constraint may not exist, that's fine
        NULL;
END $$;

-- ============================================================================
-- 8. Add sys_admin permission to tenant_users RLS for viewing all tenants
-- ============================================================================

-- Allow sys_admin to see all tenant_users records
DROP POLICY IF EXISTS "sys_admin_view_all_tenant_users" ON tenant_users;
CREATE POLICY "sys_admin_view_all_tenant_users" ON tenant_users
    FOR SELECT
    USING (public.is_sys_admin());

-- Allow sys_admin to insert into tenant_users for any tenant
DROP POLICY IF EXISTS "sys_admin_insert_tenant_users" ON tenant_users;
CREATE POLICY "sys_admin_insert_tenant_users" ON tenant_users
    FOR INSERT
    WITH CHECK (public.is_sys_admin());

-- ============================================================================
-- 9. Add sys_admin permission to tenants table for full access
-- ============================================================================

-- Allow sys_admin to see all tenants
DROP POLICY IF EXISTS "sys_admin_view_all_tenants" ON tenants;
CREATE POLICY "sys_admin_view_all_tenants" ON tenants
    FOR SELECT
    USING (public.is_sys_admin());

-- Allow sys_admin to update any tenant
DROP POLICY IF EXISTS "sys_admin_update_tenants" ON tenants;
CREATE POLICY "sys_admin_update_tenants" ON tenants
    FOR UPDATE
    USING (public.is_sys_admin());

-- Allow sys_admin to delete any tenant
DROP POLICY IF EXISTS "sys_admin_delete_tenants" ON tenants;
CREATE POLICY "sys_admin_delete_tenants" ON tenants
    FOR DELETE
    USING (public.is_sys_admin());

-- Allow sys_admin to insert tenants
DROP POLICY IF EXISTS "sys_admin_insert_tenants" ON tenants;
CREATE POLICY "sys_admin_insert_tenants" ON tenants
    FOR INSERT
    WITH CHECK (public.is_sys_admin());

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.is_sys_admin() IS 'Returns true if current authenticated user has sys_admin role';
COMMENT ON FUNCTION public.deactivate_tenant(UUID) IS 'Deactivates a tenant (sets status to inactive). Only callable by sys_admin.';
COMMENT ON FUNCTION public.permanently_delete_tenant(UUID, TEXT) IS 'Permanently deletes an inactive tenant. Requires tenant name confirmation. Only callable by sys_admin.';
COMMENT ON FUNCTION public.check_tenant_access(UUID) IS 'Checks if a tenant is active and accessible for login.';
