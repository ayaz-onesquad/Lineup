-- Fix Role Check with SECURITY DEFINER Function
-- ====================================================
-- The RLS circular dependency makes it impossible to check roles
-- using normal queries. This function bypasses RLS to get user roles.
-- ====================================================

-- Create a function to get user's roles (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id UUID)
RETURNS TABLE(role TEXT, tenant_id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT tu.role::TEXT, tu.tenant_id, tu.status::TEXT
    FROM tenant_users tu
    WHERE tu.user_id = p_user_id
    AND tu.status = 'active';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_roles(UUID) TO authenticated;

-- Create a function to get highest role (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_highest_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Priority: sys_admin > org_admin > org_user > client_user
    SELECT tu.role INTO v_role
    FROM tenant_users tu
    WHERE tu.user_id = p_user_id
    AND tu.status = 'active'
    ORDER BY
        CASE tu.role
            WHEN 'sys_admin' THEN 1
            WHEN 'org_admin' THEN 2
            WHEN 'org_user' THEN 3
            WHEN 'client_user' THEN 4
            ELSE 5
        END
    LIMIT 1;

    RETURN v_role;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_highest_role(UUID) TO authenticated;

-- Create a function to check if user is sys_admin (bypasses RLS)
CREATE OR REPLACE FUNCTION is_sys_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = p_user_id
        AND role = 'sys_admin'
        AND status = 'active'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_sys_admin(UUID) TO authenticated;

-- Test the functions (run after creating)
-- SELECT get_user_highest_role(auth.uid());
-- SELECT * FROM get_user_roles(auth.uid());
-- SELECT is_sys_admin(auth.uid());

-- ====================================================
-- Now update RLS policies to use these functions
-- ====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tenant users in their tenants" ON tenant_users;
DROP POLICY IF EXISTS "Users can view own tenant memberships" ON tenant_users;
DROP POLICY IF EXISTS "Users can read own memberships" ON tenant_users;
DROP POLICY IF EXISTS "Users can read tenant members" ON tenant_users;

-- Create new policy using the function
CREATE POLICY "Users can view tenant users" ON tenant_users
    FOR SELECT USING (
        -- Users can always see their own records
        user_id = auth.uid()
        OR
        -- Users can see other users in their tenants
        tenant_id IN (SELECT tenant_id FROM get_user_roles(auth.uid()))
    );

-- Verify
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'tenant_users' AND schemaname = 'public';
