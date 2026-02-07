-- ============================================
-- FIX CLIENT STATUS ENUM
-- Version: 004
-- Description: Create client_status ENUM type and update related functions
-- ============================================

-- ============================================
-- 1. CREATE CLIENT_STATUS ENUM IF NOT EXISTS
-- ============================================
-- Note: Postgres doesn't have IF NOT EXISTS for types, so we use DO block

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_status') THEN
    CREATE TYPE client_status AS ENUM ('active', 'inactive', 'onboarding');
  END IF;
END $$;

-- ============================================
-- 2. ADD 'onboarding' TO EXISTING ENUM IF NEEDED
-- ============================================
-- If the type exists but doesn't have 'onboarding', add it

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'client_status'::regtype
    AND enumlabel = 'onboarding'
  ) THEN
    ALTER TYPE client_status ADD VALUE IF NOT EXISTS 'onboarding';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Type doesn't exist, already created above
    NULL;
END $$;

-- ============================================
-- 3. RECREATE ATOMIC CREATE FUNCTION WITH PROPER STATUS HANDLING
-- ============================================
-- Drop and recreate to ensure clean state

DROP FUNCTION IF EXISTS create_client_with_contact(UUID, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION create_client_with_contact(
  p_tenant_id UUID,
  p_user_id UUID,
  p_client_data JSONB,
  p_contact_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_client clients;
  v_contact contacts;
  v_status text;
BEGIN
  -- Validate required parameters
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  IF p_client_data->>'name' IS NULL OR TRIM(p_client_data->>'name') = '' THEN
    RAISE EXCEPTION 'client name is required';
  END IF;

  IF p_contact_data->>'first_name' IS NULL OR TRIM(p_contact_data->>'first_name') = '' THEN
    RAISE EXCEPTION 'contact first_name is required';
  END IF;

  IF p_contact_data->>'last_name' IS NULL OR TRIM(p_contact_data->>'last_name') = '' THEN
    RAISE EXCEPTION 'contact last_name is required';
  END IF;

  -- Get status with default
  v_status := COALESCE(p_client_data->>'status', 'active');

  -- Insert client
  INSERT INTO clients (
    tenant_id,
    created_by,
    name,
    company_name,
    status,
    industry,
    location,
    overview,
    portal_enabled
  )
  VALUES (
    p_tenant_id,
    p_user_id,
    TRIM(p_client_data->>'name'),
    COALESCE(NULLIF(TRIM(p_client_data->>'company_name'), ''), TRIM(p_client_data->>'name')),
    v_status::client_status,
    p_client_data->>'industry',
    p_client_data->>'location',
    p_client_data->>'overview',
    COALESCE((p_client_data->>'portal_enabled')::boolean, false)
  )
  RETURNING * INTO v_client;

  -- Insert primary contact
  INSERT INTO contacts (
    tenant_id,
    client_id,
    created_by,
    first_name,
    last_name,
    email,
    phone,
    role,
    relationship,
    is_primary
  )
  VALUES (
    p_tenant_id,
    v_client.id,
    p_user_id,
    TRIM(p_contact_data->>'first_name'),
    TRIM(p_contact_data->>'last_name'),
    NULLIF(TRIM(p_contact_data->>'email'), ''),
    NULLIF(TRIM(p_contact_data->>'phone'), ''),
    p_contact_data->>'role',
    p_contact_data->>'relationship',
    true
  )
  RETURNING * INTO v_contact;

  -- Return both records
  RETURN jsonb_build_object(
    'client', row_to_json(v_client),
    'contact', row_to_json(v_contact)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create client with contact: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION create_client_with_contact(UUID, UUID, JSONB, JSONB) TO authenticated;

-- ============================================
-- 4. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 5. VERIFICATION QUERIES
-- ============================================
-- Run these to verify:
-- SELECT typname FROM pg_type WHERE typname = 'client_status';
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'client_status'::regtype;
-- SELECT proname FROM pg_proc WHERE proname = 'create_client_with_contact';
