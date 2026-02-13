-- ============================================
-- FIX CLIENT STATUS CONSTRAINT AND ADD CLIENT_CONTACTS JOIN TABLE
-- Version: 007
-- Description: Fix status check constraint, create many-to-many for contacts
-- ============================================

-- ============================================
-- 1. FIX CLIENT STATUS CHECK CONSTRAINT
-- ============================================
-- Drop the old constraint and add new one with all valid statuses

DO $$
BEGIN
  -- Drop existing check constraint (may have various names)
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check1;

  -- Add new constraint with all valid statuses
  ALTER TABLE clients ADD CONSTRAINT clients_status_check
    CHECK (status IN ('onboarding', 'active', 'inactive', 'prospective'));
EXCEPTION
  WHEN undefined_object THEN
    -- Constraint doesn't exist, just add the new one
    ALTER TABLE clients ADD CONSTRAINT clients_status_check
      CHECK (status IN ('onboarding', 'active', 'inactive', 'prospective'));
  WHEN others THEN
    RAISE NOTICE 'Error updating clients status constraint: %', SQLERRM;
END $$;

-- Set default to 'onboarding' for new clients
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'onboarding';

-- ============================================
-- 2. CREATE CLIENT_CONTACTS JOIN TABLE (MANY-TO-MANY)
-- ============================================
-- Allows contacts to be linked to multiple clients

CREATE TABLE IF NOT EXISTS client_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(client_id, contact_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_contact_id ON client_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_primary ON client_contacts(client_id, is_primary)
  WHERE is_primary = TRUE;

-- ============================================
-- 3. MIGRATE EXISTING CONTACT RELATIONSHIPS
-- ============================================
-- Move existing contacts.client_id relationships into client_contacts

INSERT INTO client_contacts (client_id, contact_id, is_primary, created_at, created_by)
SELECT
    c.client_id,
    c.id,
    c.is_primary,
    c.created_at,
    c.created_by
FROM contacts c
WHERE c.client_id IS NOT NULL
  AND c.deleted_at IS NULL
ON CONFLICT (client_id, contact_id) DO NOTHING;

-- ============================================
-- 4. MAKE CONTACTS.CLIENT_ID OPTIONAL
-- ============================================
-- Allow contacts to exist independently (not linked to any client via the old FK)

ALTER TABLE contacts ALTER COLUMN client_id DROP NOT NULL;

-- ============================================
-- 5. RLS POLICIES FOR CLIENT_CONTACTS
-- ============================================
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

-- Users can view client_contacts for clients in their tenants
CREATE POLICY "Users can view client_contacts in their tenants" ON client_contacts
    FOR SELECT USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- Users can insert client_contacts in their tenants
CREATE POLICY "Users can insert client_contacts" ON client_contacts
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user')
            )
        )
    );

-- Users can update client_contacts in their tenants
CREATE POLICY "Users can update client_contacts" ON client_contacts
    FOR UPDATE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user')
            )
        )
    );

-- Users can delete client_contacts in their tenants
CREATE POLICY "Users can delete client_contacts" ON client_contacts
    FOR DELETE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user')
            )
        )
    );

-- ============================================
-- 6. FUNCTION TO ENSURE SINGLE PRIMARY CONTACT PER CLIENT
-- ============================================

CREATE OR REPLACE FUNCTION ensure_single_primary_client_contact()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        UPDATE client_contacts
        SET is_primary = FALSE
        WHERE client_id = NEW.client_id
        AND id != NEW.id
        AND is_primary = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_primary_client_contact_trigger ON client_contacts;
CREATE TRIGGER ensure_single_primary_client_contact_trigger
    BEFORE INSERT OR UPDATE ON client_contacts
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_primary_client_contact();

-- ============================================
-- 7. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
