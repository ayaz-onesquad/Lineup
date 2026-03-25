-- ============================================
-- MIGRATION: Competitor Tracker
-- Version: 051
-- Description: Competitor Tracker for org_admin role only
-- Uses is_org_admin_of_tenant() from migration 048
--
-- IMPORTANT: After running this migration, execute:
--   supabase/refresh-schema-cache.sql in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CREATE COMPETITORS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS competitors (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id       INTEGER,           -- auto-generated per tenant (COMP-0001)
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Core identity
  name             VARCHAR(255) NOT NULL,
  website          TEXT,                  -- primary website URL
  industry         VARCHAR(100),          -- e.g. "SaaS", "Agency", "Consulting"
  description      TEXT,                  -- overview / notes about competitor

  -- Market position
  status           VARCHAR(50) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive', 'acquired', 'defunct')),
  threat_level     VARCHAR(20)            -- 'low' | 'medium' | 'high' | 'critical'
                   CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  target_market    TEXT,                  -- who they serve

  -- Key data points
  pricing_model    VARCHAR(100),          -- e.g. "Subscription", "Per-seat", "Usage-based"
  pricing_notes    TEXT,                  -- price ranges, tiers, etc.
  strengths        TEXT,                  -- what they do well
  weaknesses       TEXT,                  -- where they fall short
  differentiators  TEXT,                  -- how we differ from them

  -- Online presence
  linkedin_url     TEXT,
  twitter_url      TEXT,
  crunchbase_url   TEXT,

  -- Optional client link (if a competitor is also a client)
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Tags for grouping
  tags             TEXT[] NOT NULL DEFAULT '{}',

  -- Audit
  last_reviewed_at TIMESTAMPTZ,          -- when this record was last manually reviewed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ
);

-- ============================================
-- 2. CREATE DISPLAY_ID TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION generate_competitors_display_id()
RETURNS TRIGGER AS $$
DECLARE
    max_id INTEGER;
BEGIN
    -- Get max display_id for this tenant in competitors table
    SELECT COALESCE(MAX(display_id), 0) INTO max_id
    FROM competitors
    WHERE tenant_id = NEW.tenant_id;

    NEW.display_id := max_id + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_competitors_display_id ON competitors;
CREATE TRIGGER set_competitors_display_id
    BEFORE INSERT ON competitors
    FOR EACH ROW
    WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_competitors_display_id();

-- ============================================
-- 3. UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_competitors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS competitors_updated_at ON competitors;
CREATE TRIGGER competitors_updated_at
    BEFORE UPDATE ON competitors
    FOR EACH ROW
    EXECUTE FUNCTION update_competitors_updated_at();

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;

-- Only org_admin of this tenant can SELECT
DROP POLICY IF EXISTS "competitors_select" ON competitors;
CREATE POLICY "competitors_select" ON competitors
  FOR SELECT USING (
    deleted_at IS NULL AND public.is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can INSERT
DROP POLICY IF EXISTS "competitors_insert" ON competitors;
CREATE POLICY "competitors_insert" ON competitors
  FOR INSERT WITH CHECK (
    public.is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can UPDATE
DROP POLICY IF EXISTS "competitors_update" ON competitors;
CREATE POLICY "competitors_update" ON competitors
  FOR UPDATE USING (
    public.is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can DELETE (soft delete via deleted_at)
DROP POLICY IF EXISTS "competitors_delete" ON competitors;
CREATE POLICY "competitors_delete" ON competitors
  FOR DELETE USING (
    public.is_org_admin_of_tenant(tenant_id)
  );

-- ============================================
-- 5. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_competitors_tenant
  ON competitors(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_competitors_status
  ON competitors(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_competitors_threat
  ON competitors(tenant_id, threat_level) WHERE deleted_at IS NULL;

-- ============================================
-- 6. VERIFICATION
-- ============================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'competitors' ORDER BY ordinal_position;
