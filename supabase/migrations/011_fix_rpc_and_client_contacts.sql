-- ============================================
-- FIX RPC FUNCTION AND CLIENT_CONTACTS SCHEMA
-- Version: 011
-- Description: Update create_client_with_contact to use client_contacts join table,
--              add tenant_id to client_contacts for consistency
-- ============================================

-- ============================================
-- 1. ADD tenant_id TO client_contacts FOR CONSISTENCY
-- ============================================
-- While RLS works via client_id -> clients.tenant_id,
-- having tenant_id directly allows for simpler queries and constraints

ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Backfill tenant_id from parent clients
UPDATE client_contacts cc
SET tenant_id = c.tenant_id
FROM clients c
WHERE cc.client_id = c.id
  AND cc.tenant_id IS NULL;

-- Create index for tenant_id
CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant_id ON client_contacts(tenant_id);

-- ============================================
-- 2. REMOVE OLD UNIQUE INDEX THAT REFERENCES is_primary ON contacts
-- ============================================
-- The old index was on contacts.is_primary which no longer exists
DROP INDEX IF EXISTS idx_contacts_one_primary_per_client;

-- ============================================
-- 3. UPDATE create_client_with_contact RPC FUNCTION
-- ============================================
-- This function now uses client_contacts join table for is_primary
-- instead of the deprecated is_primary column on contacts table

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
    p_client_data->>'referral_source'
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
-- 4. UPDATE RLS POLICIES FOR client_contacts WITH tenant_id
-- ============================================
-- Now that tenant_id exists, we can use it directly in RLS for efficiency

DROP POLICY IF EXISTS "Users can view client_contacts in their tenants" ON client_contacts;
DROP POLICY IF EXISTS "Users can insert client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can update client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can delete client_contacts" ON client_contacts;

-- SELECT: Users can view client_contacts in their tenants (using tenant_id OR client_id fallback)
CREATE POLICY "Users can view client_contacts in their tenants" ON client_contacts
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        )
    );

-- INSERT: Users can insert client_contacts in their tenants
CREATE POLICY "Users can insert client_contacts" ON client_contacts
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- UPDATE: Users can update client_contacts in their tenants
CREATE POLICY "Users can update client_contacts" ON client_contacts
    FOR UPDATE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- DELETE: Users can delete client_contacts in their tenants
CREATE POLICY "Users can delete client_contacts" ON client_contacts
    FOR DELETE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- ============================================
-- 5. TRIGGER TO AUTO-POPULATE tenant_id ON INSERT
-- ============================================
-- When inserting into client_contacts, auto-set tenant_id from parent client

CREATE OR REPLACE FUNCTION set_client_contacts_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        SELECT tenant_id INTO NEW.tenant_id
        FROM clients
        WHERE id = NEW.client_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_contacts_set_tenant_id_trigger ON client_contacts;
CREATE TRIGGER client_contacts_set_tenant_id_trigger
    BEFORE INSERT ON client_contacts
    FOR EACH ROW
    EXECUTE FUNCTION set_client_contacts_tenant_id();

-- ============================================
-- 6. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
