-- ============================================
-- MIGRATION: Password Manager
-- Version: 048
-- Description: Password Manager for org_admin role only
--
-- IMPORTANT: After running this migration, execute:
--   supabase/refresh-schema-cache.sql in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CREATE PASSWORDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS passwords (
  -- Identity
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id          INTEGER,           -- auto-generated per tenant
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Core credential fields
  application_name    VARCHAR(255) NOT NULL, -- e.g. "AWS Console", "Client Stripe Account"
  url                 TEXT,                  -- login URL, optional
  username            VARCHAR(255),          -- login username
  email               VARCHAR(255),          -- login email (separate from username)
  password            TEXT NOT NULL,         -- stored credential

  -- Organization
  category            VARCHAR(100),          -- e.g. "Client Tools", "Internal", "Finance"
  notes               TEXT,                  -- internal notes about this credential

  -- Password tracking
  password_changed_at TIMESTAMPTZ,          -- when the password was last rotated

  -- Audit trail (standard pattern — matches all other entities)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ            -- soft delete
);

-- ============================================
-- 2. CREATE SEQUENCE AND DISPLAY_ID TRIGGER
-- ============================================
CREATE SEQUENCE IF NOT EXISTS passwords_display_id_seq;

-- Trigger to auto-generate display_id per tenant (same pattern as other entities)
CREATE OR REPLACE FUNCTION generate_passwords_display_id()
RETURNS TRIGGER AS $$
DECLARE
    max_id INTEGER;
BEGIN
    -- Get max display_id for this tenant in passwords table
    SELECT COALESCE(MAX(display_id), 0) INTO max_id
    FROM passwords
    WHERE tenant_id = NEW.tenant_id;

    NEW.display_id := max_id + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_passwords_display_id ON passwords;
CREATE TRIGGER set_passwords_display_id
    BEFORE INSERT ON passwords
    FOR EACH ROW
    WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_passwords_display_id();

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_passwords_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS passwords_updated_at ON passwords;
CREATE TRIGGER passwords_updated_at
    BEFORE UPDATE ON passwords
    FOR EACH ROW
    EXECUTE FUNCTION update_passwords_updated_at();

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE passwords ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is org_admin of a specific tenant
CREATE OR REPLACE FUNCTION is_org_admin_of_tenant(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- Get current user ID
    v_user_id := (SELECT auth.uid());
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if user is org_admin or sys_admin for this tenant
    SELECT EXISTS (
        SELECT 1
        FROM tenant_users
        WHERE user_id = v_user_id
          AND tenant_id = p_tenant_id
          AND role IN ('org_admin', 'sys_admin')
          AND status = 'active'
    ) INTO v_is_admin;

    RETURN v_is_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only org_admin of this tenant can SELECT
DROP POLICY IF EXISTS "passwords_select_org_admin" ON passwords;
CREATE POLICY "passwords_select_org_admin" ON passwords
  FOR SELECT USING (
    tenant_id = (SELECT current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
    AND is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can INSERT
DROP POLICY IF EXISTS "passwords_insert_org_admin" ON passwords;
CREATE POLICY "passwords_insert_org_admin" ON passwords
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
    AND is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can UPDATE
DROP POLICY IF EXISTS "passwords_update_org_admin" ON passwords;
CREATE POLICY "passwords_update_org_admin" ON passwords
  FOR UPDATE USING (
    is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can DELETE (soft delete via deleted_at)
DROP POLICY IF EXISTS "passwords_delete_org_admin" ON passwords;
CREATE POLICY "passwords_delete_org_admin" ON passwords
  FOR DELETE USING (
    is_org_admin_of_tenant(tenant_id)
  );

-- ============================================
-- 5. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_passwords_tenant
  ON passwords(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_passwords_category
  ON passwords(tenant_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_passwords_application
  ON passwords(tenant_id, application_name) WHERE deleted_at IS NULL;

-- ============================================
-- 6. VERIFICATION
-- ============================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'passwords' ORDER BY ordinal_position;
