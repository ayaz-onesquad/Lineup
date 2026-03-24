-- ============================================
-- MIGRATION: Financial Manager
-- Version: 050
-- Description: Financial Manager for org_admin role only
--              Tracks expenses and revenue with recurring entries
--
-- IMPORTANT: After running this migration, execute:
--   supabase/refresh-schema-cache.sql in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FINANCIAL GROUPS TABLE
-- Simple lookup: group/category buckets per tenant
-- ============================================
CREATE TABLE IF NOT EXISTS financial_groups (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,        -- e.g. "SaaS Tools", "Client Revenue"
  type         VARCHAR(20)  NOT NULL         -- 'expense' | 'revenue' | 'both'
               CHECK (type IN ('expense', 'revenue', 'both')),
  color        VARCHAR(20),                  -- optional hex color for UI badge
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ
);

-- ============================================
-- 2. FINANCIAL ENTRIES TABLE
-- The definition of an expense or revenue item.
-- One-time OR recurring. Linked to client or internal.
-- ============================================
CREATE TABLE IF NOT EXISTS financial_entries (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id       VARCHAR(20),              -- auto-generated FIN-0001
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Classification
  type             VARCHAR(20) NOT NULL      -- 'expense' | 'revenue'
                   CHECK (type IN ('expense', 'revenue')),
  group_id         UUID REFERENCES financial_groups(id) ON DELETE SET NULL,

  -- Description
  name             VARCHAR(255) NOT NULL,    -- e.g. "GitHub Subscription"
  description      TEXT,

  -- Amount
  amount           DECIMAL(14,2) NOT NULL,
  currency         VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Recurrence
  is_recurring     BOOLEAN NOT NULL DEFAULT FALSE,
  frequency        VARCHAR(20)               -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
                   CHECK (frequency IS NULL OR frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  -- Day of month for monthly/quarterly/yearly (e.g. 1 = 1st of month)
  recurrence_day   INTEGER CHECK (recurrence_day IS NULL OR (recurrence_day BETWEEN 1 AND 31)),
  -- When does recurrence start and optionally end
  start_date       DATE NOT NULL,
  end_date         DATE,                     -- NULL = recurring indefinitely

  -- Client link (NULL = internal)
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Vendor/source info (optional)
  vendor           VARCHAR(255),             -- e.g. "GitHub Inc."
  reference_number VARCHAR(100),             -- invoice or PO number

  -- Audit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at       TIMESTAMPTZ
);

-- ============================================
-- 3. FINANCIAL OCCURRENCES TABLE
-- Each individual instance of an entry (one-time = 1 row, recurring = N rows)
-- ============================================
CREATE TABLE IF NOT EXISTS financial_occurrences (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id     UUID NOT NULL REFERENCES financial_entries(id) ON DELETE CASCADE,

  due_date     DATE NOT NULL,               -- when this occurrence is due
  amount       DECIMAL(14,2) NOT NULL,      -- can be overridden per occurrence
  currency     VARCHAR(3) NOT NULL DEFAULT 'USD',

  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'paid', 'received', 'overdue', 'cancelled')),
  paid_date    DATE,                        -- NULL until paid/received
  notes        TEXT,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,

  -- Unique constraint for upsert support
  CONSTRAINT fin_occurrences_entry_date_unique UNIQUE (entry_id, due_date)
);

-- ============================================
-- 4. DISPLAY_ID SEQUENCE AND TRIGGER FOR FINANCIAL_ENTRIES
-- Format: 'FIN-' || LPAD(sequence::text, 4, '0') = FIN-0001
-- ============================================
CREATE SEQUENCE IF NOT EXISTS financial_entries_display_id_seq;

CREATE OR REPLACE FUNCTION generate_financial_entries_display_id()
RETURNS TRIGGER AS $$
DECLARE
    max_id INTEGER;
BEGIN
    -- Get max display_id number for this tenant in financial_entries table
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(display_id FROM 5) AS INTEGER)), 0
    ) INTO max_id
    FROM financial_entries
    WHERE tenant_id = NEW.tenant_id
      AND display_id IS NOT NULL
      AND display_id ~ '^FIN-[0-9]+$';

    NEW.display_id := 'FIN-' || LPAD((max_id + 1)::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_financial_entries_display_id ON financial_entries;
CREATE TRIGGER set_financial_entries_display_id
    BEFORE INSERT ON financial_entries
    FOR EACH ROW
    WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_financial_entries_display_id();

-- ============================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================

-- financial_groups updated_at
CREATE OR REPLACE FUNCTION update_financial_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS financial_groups_updated_at ON financial_groups;
CREATE TRIGGER financial_groups_updated_at
    BEFORE UPDATE ON financial_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_groups_updated_at();

-- financial_entries updated_at
CREATE OR REPLACE FUNCTION update_financial_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS financial_entries_updated_at ON financial_entries;
CREATE TRIGGER financial_entries_updated_at
    BEFORE UPDATE ON financial_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_entries_updated_at();

-- financial_occurrences updated_at
CREATE OR REPLACE FUNCTION update_financial_occurrences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS financial_occurrences_updated_at ON financial_occurrences;
CREATE TRIGGER financial_occurrences_updated_at
    BEFORE UPDATE ON financial_occurrences
    FOR EACH ROW
    EXECUTE FUNCTION update_financial_occurrences_updated_at();

-- ============================================
-- 6. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_fin_groups_tenant
  ON financial_groups(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_entries_tenant
  ON financial_entries(tenant_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_entries_client
  ON financial_entries(tenant_id, client_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_entries_type
  ON financial_entries(tenant_id, type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_occurrences_entry
  ON financial_occurrences(entry_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_occurrences_due
  ON financial_occurrences(tenant_id, due_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fin_occurrences_status
  ON financial_occurrences(tenant_id, status) WHERE deleted_at IS NULL;

-- ============================================
-- 7. ROW LEVEL SECURITY: financial_groups
-- ============================================
ALTER TABLE financial_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_groups_select" ON financial_groups;
CREATE POLICY "fin_groups_select" ON financial_groups
  FOR SELECT USING (
    deleted_at IS NULL AND public.is_org_admin_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "fin_groups_insert" ON financial_groups;
CREATE POLICY "fin_groups_insert" ON financial_groups
  FOR INSERT WITH CHECK (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_groups_update" ON financial_groups;
CREATE POLICY "fin_groups_update" ON financial_groups
  FOR UPDATE USING (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_groups_delete" ON financial_groups;
CREATE POLICY "fin_groups_delete" ON financial_groups
  FOR DELETE USING (public.is_org_admin_of_tenant(tenant_id));

-- ============================================
-- 8. ROW LEVEL SECURITY: financial_entries
-- ============================================
ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_entries_select" ON financial_entries;
CREATE POLICY "fin_entries_select" ON financial_entries
  FOR SELECT USING (
    deleted_at IS NULL AND public.is_org_admin_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "fin_entries_insert" ON financial_entries;
CREATE POLICY "fin_entries_insert" ON financial_entries
  FOR INSERT WITH CHECK (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_entries_update" ON financial_entries;
CREATE POLICY "fin_entries_update" ON financial_entries
  FOR UPDATE USING (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_entries_delete" ON financial_entries;
CREATE POLICY "fin_entries_delete" ON financial_entries
  FOR DELETE USING (public.is_org_admin_of_tenant(tenant_id));

-- ============================================
-- 9. ROW LEVEL SECURITY: financial_occurrences
-- ============================================
ALTER TABLE financial_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_occurrences_select" ON financial_occurrences;
CREATE POLICY "fin_occurrences_select" ON financial_occurrences
  FOR SELECT USING (
    deleted_at IS NULL AND public.is_org_admin_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "fin_occurrences_insert" ON financial_occurrences;
CREATE POLICY "fin_occurrences_insert" ON financial_occurrences
  FOR INSERT WITH CHECK (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_occurrences_update" ON financial_occurrences;
CREATE POLICY "fin_occurrences_update" ON financial_occurrences
  FOR UPDATE USING (public.is_org_admin_of_tenant(tenant_id));

DROP POLICY IF EXISTS "fin_occurrences_delete" ON financial_occurrences;
CREATE POLICY "fin_occurrences_delete" ON financial_occurrences
  FOR DELETE USING (public.is_org_admin_of_tenant(tenant_id));

-- ============================================
-- 10. VERIFICATION
-- ============================================
SELECT table_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name IN ('financial_groups','financial_entries','financial_occurrences')
GROUP BY table_name ORDER BY table_name;
