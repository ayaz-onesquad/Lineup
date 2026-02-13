-- ============================================
-- ONBOARDING TENANT CREATION
-- Version: 024
-- Description: RPC function to allow new users to create their first tenant during onboarding
-- ============================================

-- Create function for new user onboarding
-- This bypasses RLS so new users (who don't have tenant_users records yet) can create their first tenant
CREATE OR REPLACE FUNCTION create_tenant_for_onboarding(
  p_name TEXT,
  p_slug TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_tenant JSON;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check if user already has tenants (shouldn't be calling this if they do)
  IF EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'User already has a tenant';
  END IF;

  -- Create the tenant
  INSERT INTO tenants (name, slug, status, plan_tier)
  VALUES (p_name, p_slug, 'active', 'starter')
  RETURNING id INTO v_tenant_id;

  -- Add user as org_admin of the new tenant
  INSERT INTO tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, v_user_id, 'org_admin', 'active');

  -- Return the created tenant
  SELECT json_build_object(
    'id', t.id,
    'name', t.name,
    'slug', t.slug,
    'status', t.status,
    'plan_tier', t.plan_tier,
    'created_at', t.created_at
  ) INTO v_tenant
  FROM tenants t
  WHERE t.id = v_tenant_id;

  RETURN v_tenant;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_tenant_for_onboarding(TEXT, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION create_tenant_for_onboarding IS
  'Allows new users to create their first tenant during onboarding. Uses SECURITY DEFINER to bypass RLS.';

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
