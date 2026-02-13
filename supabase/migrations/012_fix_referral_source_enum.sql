-- ============================================
-- FIX REFERRAL_SOURCE TYPE CAST IN RPC
-- Version: 012
-- Description: Update create_client_with_contact RPC to properly cast
--              referral_source text to the referral_source ENUM type
-- ============================================

-- ============================================
-- 1. UPDATE create_client_with_contact RPC FUNCTION
-- ============================================
-- Fix: Add explicit ::referral_source cast for the ENUM field

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
  v_referral_source_text TEXT;
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

  -- Extract and validate referral_source
  v_referral_source_text := NULLIF(TRIM(COALESCE(p_client_data->>'referral_source', '')), '');

  -- Insert client with proper type casts for ENUM fields
  INSERT INTO clients (
    tenant_id,
    created_by,
    name,
    company_name,
    status,
    industry,
    location,
    overview,
    portal_enabled,
    referral_source
  )
  VALUES (
    p_tenant_id,
    p_user_id,
    TRIM(p_client_data->>'name'),
    COALESCE(NULLIF(TRIM(p_client_data->>'company_name'), ''), TRIM(p_client_data->>'name')),
    COALESCE((p_client_data->>'status')::text, 'onboarding')::client_status,
    p_client_data->>'industry',
    p_client_data->>'location',
    p_client_data->>'overview',
    COALESCE((p_client_data->>'portal_enabled')::boolean, true),
    -- FIX: Cast referral_source to the ENUM type (handles NULL gracefully)
    v_referral_source_text::referral_source
  )
  RETURNING * INTO v_client;

  -- Insert contact (WITHOUT is_primary - that column was removed in migration 008)
  INSERT INTO contacts (
    tenant_id,
    client_id,
    created_by,
    first_name,
    last_name,
    email,
    phone,
    role,
    relationship
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
    p_contact_data->>'relationship'
  )
  RETURNING * INTO v_contact;

  -- Create client_contacts join table entry with is_primary = true
  -- This is where is_primary lives now (migration 007/008)
  INSERT INTO client_contacts (
    tenant_id,
    client_id,
    contact_id,
    is_primary,
    created_by
  )
  VALUES (
    p_tenant_id,
    v_client.id,
    v_contact.id,
    true,  -- Always primary when creating with client
    p_user_id
  );

  -- Return both records as JSONB object
  RETURN jsonb_build_object(
    'client', row_to_json(v_client),
    'contact', row_to_json(v_contact)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create client with contact: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
