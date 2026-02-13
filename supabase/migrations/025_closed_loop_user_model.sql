-- Migration 025: Closed-Loop User Model
-- Implements:
-- 1. Strict RLS policy for user_profiles based on tenant membership
-- 2. client_users join table for linking client_user role to specific clients
-- 3. RPC function for converting contacts to client users
-- 4. OrgAdmin permission to create users within their tenant

-- ============================================================================
-- 1. Create client_users join table (links client_user to specific client)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(user_id, client_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_client_users_tenant_id ON client_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_users_user_id ON client_users(user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_client_id ON client_users(client_id);
CREATE INDEX IF NOT EXISTS idx_client_users_contact_id ON client_users(contact_id);

-- Enable RLS
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_users
CREATE POLICY "client_users_select_policy" ON client_users
    FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "client_users_insert_policy" ON client_users
    FOR INSERT
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
            AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "client_users_update_policy" ON client_users
    FOR UPDATE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
            AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "client_users_delete_policy" ON client_users
    FOR DELETE
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
            AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_client_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_users_updated_at_trigger ON client_users;
CREATE TRIGGER client_users_updated_at_trigger
    BEFORE UPDATE ON client_users
    FOR EACH ROW
    EXECUTE FUNCTION update_client_users_updated_at();

-- ============================================================================
-- 2. Update user_profiles RLS for tenant isolation
-- ============================================================================

-- Drop existing select policy if it exists
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_policy" ON user_profiles;

-- Create new SELECT policy: Users see profiles in their tenant(s) OR their own
CREATE POLICY "user_profiles_tenant_select_policy" ON user_profiles
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

-- ============================================================================
-- 3. Add org_admin permission to create users
-- ============================================================================

-- Check if user is org_admin for a specific tenant
CREATE OR REPLACE FUNCTION public.is_org_admin(p_tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    -- If no tenant specified, check if user is org_admin in any tenant
    IF p_tenant_id IS NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = auth.uid()
            AND role IN ('sys_admin', 'org_admin')
            AND status = 'active'
        );
    END IF;

    -- Check if user is org_admin for specific tenant
    RETURN EXISTS (
        SELECT 1 FROM tenant_users
        WHERE user_id = auth.uid()
        AND tenant_id = p_tenant_id
        AND role IN ('sys_admin', 'org_admin')
        AND status = 'active'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;

-- Update INSERT policy for user_profiles to allow org_admin
DROP POLICY IF EXISTS "user_profiles_insert_policy" ON user_profiles;
CREATE POLICY "user_profiles_insert_policy" ON user_profiles
    FOR INSERT
    WITH CHECK (
        -- Users can insert their own profile
        auth.uid() = user_id
        -- OR sys_admin can insert any
        OR public.is_sys_admin()
        -- OR org_admin can insert for users they're adding to their tenant
        OR public.is_org_admin()
    );

-- Update tenant_users INSERT policy to allow org_admin for their tenant
DROP POLICY IF EXISTS "org_admin_insert_tenant_users" ON tenant_users;
CREATE POLICY "org_admin_insert_tenant_users" ON tenant_users
    FOR INSERT
    WITH CHECK (
        -- Org admin can add users to their tenant
        tenant_id IN (
            SELECT tu.tenant_id FROM tenant_users tu
            WHERE tu.user_id = auth.uid()
            AND tu.role IN ('org_admin')
            AND tu.status = 'active'
        )
        -- OR sys_admin (already handled by separate policy but including for clarity)
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. RPC function to convert contact to client user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.convert_contact_to_client_user(
    p_contact_id UUID,
    p_email TEXT,
    p_temp_password TEXT,
    p_client_id UUID,
    p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contact RECORD;
    v_user_id UUID;
    v_profile_id UUID;
    v_result JSON;
BEGIN
    -- Check permission: must be org_admin for this tenant
    IF NOT public.is_org_admin(p_tenant_id) AND NOT public.is_sys_admin() THEN
        RAISE EXCEPTION 'Only organization administrators can convert contacts to users';
    END IF;

    -- Get contact info
    SELECT * INTO v_contact FROM contacts WHERE id = p_contact_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found';
    END IF;

    -- Check contact belongs to the specified tenant
    IF v_contact.tenant_id != p_tenant_id THEN
        RAISE EXCEPTION 'Contact does not belong to this tenant';
    END IF;

    -- Note: The actual auth.users creation must happen client-side via signUp
    -- This function handles the post-creation steps:
    -- 1. Creating the client_users link
    -- 2. Adding tenant_users entry with client_user role

    -- For now, this function is a placeholder that returns what needs to be done
    -- The actual implementation will be in the frontend API

    v_result := json_build_object(
        'contact_id', p_contact_id,
        'email', p_email,
        'client_id', p_client_id,
        'tenant_id', p_tenant_id,
        'full_name', v_contact.first_name || ' ' || v_contact.last_name,
        'status', 'ready_for_user_creation'
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_contact_to_client_user(UUID, TEXT, TEXT, UUID, UUID) TO authenticated;

-- ============================================================================
-- 5. RPC function to link existing user to client (after auth user creation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_client_user(
    p_user_id UUID,
    p_client_id UUID,
    p_contact_id UUID,
    p_tenant_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_user_id UUID;
    v_client_user_id UUID;
BEGIN
    -- Check permission: must be org_admin for this tenant
    IF NOT public.is_org_admin(p_tenant_id) AND NOT public.is_sys_admin() THEN
        RAISE EXCEPTION 'Only organization administrators can link client users';
    END IF;

    -- 1. Add to tenant_users with client_user role (if not already exists)
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (p_tenant_id, p_user_id, 'client_user', 'active')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'client_user'
    RETURNING id INTO v_tenant_user_id;

    -- 2. Add to client_users to link to specific client
    INSERT INTO client_users (tenant_id, user_id, client_id, contact_id, created_by)
    VALUES (p_tenant_id, p_user_id, p_client_id, p_contact_id, auth.uid())
    ON CONFLICT (user_id, client_id) DO UPDATE SET contact_id = p_contact_id
    RETURNING id INTO v_client_user_id;

    RETURN json_build_object(
        'tenant_user_id', v_tenant_user_id,
        'client_user_id', v_client_user_id,
        'success', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_client_user(UUID, UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE client_users IS 'Links client_user role users to specific clients they can access';
COMMENT ON FUNCTION public.is_org_admin(UUID) IS 'Returns true if current user is org_admin (optionally for a specific tenant)';
COMMENT ON FUNCTION public.convert_contact_to_client_user(UUID, TEXT, TEXT, UUID, UUID) IS 'Validates and prepares contact for conversion to client user';
COMMENT ON FUNCTION public.link_client_user(UUID, UUID, UUID, UUID) IS 'Links an auth user to a client as a client_user';
