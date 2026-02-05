-- ============================================
-- COMPREHENSIVE LINEUP UPDATE MIGRATION
-- Version: 002
-- Description: Adds contacts, display_id, audit fields, date fields, org controls
-- ============================================

-- ============================================
-- 1. ADD DISPLAY_ID SEQUENCES AND COLUMNS
-- ============================================

-- Create sequences for each table (per-tenant auto-increment handled via trigger)
CREATE SEQUENCE IF NOT EXISTS clients_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS projects_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS project_phases_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS sets_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS requirements_display_id_seq;
CREATE SEQUENCE IF NOT EXISTS contacts_display_id_seq;

-- Add display_id columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS display_id INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS display_id INTEGER;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS display_id INTEGER;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS display_id INTEGER;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS display_id INTEGER;

-- ============================================
-- 2. ADD AUDIT FIELDS (updated_by)
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE sets ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- ============================================
-- 3. ADD DATE FIELDS TO SETS AND REQUIREMENTS
-- ============================================

-- Sets already has due_date, add full date tracking
ALTER TABLE sets ADD COLUMN IF NOT EXISTS expected_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS expected_end_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS completion_date TIMESTAMPTZ;

-- Requirements - add full date tracking
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS expected_start_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS expected_end_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS actual_end_date DATE;
-- Note: requirements already has completed_at which serves as completion_date

-- Projects - add completion_date (already has other date fields)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_date TIMESTAMPTZ;

-- ============================================
-- 4. UPDATE CLIENT FIELDS
-- ============================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS location TEXT;

-- Remove old contact fields (we'll use contacts table instead)
-- Keep them for backward compatibility, mark as deprecated
COMMENT ON COLUMN clients.email IS 'DEPRECATED: Use contacts table';
COMMENT ON COLUMN clients.phone IS 'DEPRECATED: Use contacts table';

-- ============================================
-- 5. CREATE CONTACTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    display_id INTEGER,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT CHECK (role IN ('owner', 'executive', 'manager', 'coordinator', 'technical', 'billing', 'other')),
    relationship TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Index for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_is_primary ON contacts(client_id, is_primary) WHERE is_primary = TRUE AND deleted_at IS NULL;

-- ============================================
-- 6. UPDATE URGENCY TO INCLUDE CRITICAL
-- ============================================

-- Update urgency check constraint to include 'critical'
ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_urgency_check;
ALTER TABLE sets ADD CONSTRAINT sets_urgency_check CHECK (urgency IN ('low', 'medium', 'high', 'critical'));

-- Add urgency and importance to requirements (for Eisenhower at requirement level)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high'));

-- ============================================
-- 7. ADD ORG USER FIELDS (Lead, Secondary Lead, PM)
-- ============================================

-- Projects already has lead_id, add secondary_lead_id and pm_id
ALTER TABLE projects ADD COLUMN IF NOT EXISTS secondary_lead_id UUID REFERENCES auth.users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_id UUID REFERENCES auth.users(id);

-- Sets - add lead, secondary_lead, pm
ALTER TABLE sets ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES auth.users(id);
ALTER TABLE sets ADD COLUMN IF NOT EXISTS secondary_lead_id UUID REFERENCES auth.users(id);
ALTER TABLE sets ADD COLUMN IF NOT EXISTS pm_id UUID REFERENCES auth.users(id);

-- Requirements - add lead, secondary_lead, pm (assigned_to_id already exists)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES auth.users(id);
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS secondary_lead_id UUID REFERENCES auth.users(id);
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS pm_id UUID REFERENCES auth.users(id);

-- ============================================
-- 8. REVIEW WORKFLOW FIELDS FOR REQUIREMENTS
-- ============================================

-- Rename reviewer_id to review_assigned_to for clarity (if needed)
-- Actually, reviewer_id already exists, just need to ensure it's properly used
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'not_required'
    CHECK (review_status IN ('not_required', 'pending', 'in_review', 'approved', 'rejected'));

-- ============================================
-- 9. FUNCTION TO AUTO-GENERATE DISPLAY_ID PER TENANT
-- ============================================

CREATE OR REPLACE FUNCTION generate_display_id()
RETURNS TRIGGER AS $$
DECLARE
    max_id INTEGER;
BEGIN
    -- Get max display_id for this tenant in this table
    EXECUTE format(
        'SELECT COALESCE(MAX(display_id), 0) FROM %I WHERE tenant_id = $1',
        TG_TABLE_NAME
    ) INTO max_id USING NEW.tenant_id;

    NEW.display_id := max_id + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for display_id generation
DROP TRIGGER IF EXISTS generate_clients_display_id ON clients;
CREATE TRIGGER generate_clients_display_id
    BEFORE INSERT ON clients
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

DROP TRIGGER IF EXISTS generate_projects_display_id ON projects;
CREATE TRIGGER generate_projects_display_id
    BEFORE INSERT ON projects
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

DROP TRIGGER IF EXISTS generate_project_phases_display_id ON project_phases;
CREATE TRIGGER generate_project_phases_display_id
    BEFORE INSERT ON project_phases
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

DROP TRIGGER IF EXISTS generate_sets_display_id ON sets;
CREATE TRIGGER generate_sets_display_id
    BEFORE INSERT ON sets
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

DROP TRIGGER IF EXISTS generate_requirements_display_id ON requirements;
CREATE TRIGGER generate_requirements_display_id
    BEFORE INSERT ON requirements
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

DROP TRIGGER IF EXISTS generate_contacts_display_id ON contacts;
CREATE TRIGGER generate_contacts_display_id
    BEFORE INSERT ON contacts
    FOR EACH ROW WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_display_id();

-- ============================================
-- 10. FUNCTION TO CALCULATE EISENHOWER PRIORITY (1-6)
-- ============================================

CREATE OR REPLACE FUNCTION calculate_priority_score(p_urgency TEXT, p_importance TEXT)
RETURNS INTEGER AS $$
BEGIN
    -- Eisenhower Matrix Priority Score:
    -- 1 = Critical + High Importance (Do First)
    -- 2 = High Urgency + High Importance (Do Second)
    -- 3 = Critical + Medium Importance OR High + Medium
    -- 4 = Medium Urgency + High Importance (Schedule)
    -- 5 = Any + Low Importance OR Low Urgency + Medium
    -- 6 = Low + Low (Delegate/Delete)

    IF p_urgency = 'critical' AND p_importance = 'high' THEN RETURN 1;
    ELSIF p_urgency = 'high' AND p_importance = 'high' THEN RETURN 2;
    ELSIF (p_urgency = 'critical' AND p_importance = 'medium') OR (p_urgency = 'high' AND p_importance = 'medium') THEN RETURN 3;
    ELSIF p_urgency = 'medium' AND p_importance = 'high' THEN RETURN 4;
    ELSIF p_importance = 'low' OR (p_urgency = 'low' AND p_importance = 'medium') THEN RETURN 5;
    ELSE RETURN 6;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add priority_score computed columns (or we can calculate in app)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS priority_score INTEGER GENERATED ALWAYS AS (
    CASE
        WHEN urgency = 'critical' AND importance = 'high' THEN 1
        WHEN urgency = 'high' AND importance = 'high' THEN 2
        WHEN (urgency = 'critical' AND importance = 'medium') OR (urgency = 'high' AND importance = 'medium') THEN 3
        WHEN urgency = 'medium' AND importance = 'high' THEN 4
        WHEN importance = 'low' OR (urgency = 'low' AND importance = 'medium') THEN 5
        ELSE 6
    END
) STORED;

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS priority_score INTEGER GENERATED ALWAYS AS (
    CASE
        WHEN urgency = 'critical' AND importance = 'high' THEN 1
        WHEN urgency = 'high' AND importance = 'high' THEN 2
        WHEN (urgency = 'critical' AND importance = 'medium') OR (urgency = 'high' AND importance = 'medium') THEN 3
        WHEN urgency = 'medium' AND importance = 'high' THEN 4
        WHEN importance = 'low' OR (urgency = 'low' AND importance = 'medium') THEN 5
        ELSE 6
    END
) STORED;

-- ============================================
-- 11. ENSURE PRIMARY CONTACT UNIQUENESS
-- ============================================

CREATE OR REPLACE FUNCTION ensure_single_primary_contact()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        UPDATE contacts
        SET is_primary = FALSE
        WHERE client_id = NEW.client_id
        AND id != NEW.id
        AND is_primary = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ensure_single_primary_contact_trigger ON contacts;
CREATE TRIGGER ensure_single_primary_contact_trigger
    BEFORE INSERT OR UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_primary_contact();

-- ============================================
-- 12. RLS POLICIES FOR CONTACTS
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts in their tenants" ON contacts
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert contacts in their tenants" ON contacts
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update contacts in their tenants" ON contacts
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete contacts" ON contacts
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- ============================================
-- 13. UPDATED_AT TRIGGER FOR CONTACTS
-- ============================================

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 14. BACKFILL DISPLAY_IDS FOR EXISTING RECORDS
-- ============================================

-- Backfill display_ids for existing records
DO $$
DECLARE
    t RECORD;
    r RECORD;
    counter INTEGER;
BEGIN
    -- Clients
    FOR t IN SELECT DISTINCT tenant_id FROM clients LOOP
        counter := 1;
        FOR r IN SELECT id FROM clients WHERE tenant_id = t.tenant_id AND display_id IS NULL ORDER BY created_at LOOP
            UPDATE clients SET display_id = counter WHERE id = r.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;

    -- Projects
    FOR t IN SELECT DISTINCT tenant_id FROM projects LOOP
        counter := 1;
        FOR r IN SELECT id FROM projects WHERE tenant_id = t.tenant_id AND display_id IS NULL ORDER BY created_at LOOP
            UPDATE projects SET display_id = counter WHERE id = r.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;

    -- Project Phases
    FOR t IN SELECT DISTINCT tenant_id FROM project_phases LOOP
        counter := 1;
        FOR r IN SELECT id FROM project_phases WHERE tenant_id = t.tenant_id AND display_id IS NULL ORDER BY created_at LOOP
            UPDATE project_phases SET display_id = counter WHERE id = r.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;

    -- Sets
    FOR t IN SELECT DISTINCT tenant_id FROM sets LOOP
        counter := 1;
        FOR r IN SELECT id FROM sets WHERE tenant_id = t.tenant_id AND display_id IS NULL ORDER BY created_at LOOP
            UPDATE sets SET display_id = counter WHERE id = r.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;

    -- Requirements
    FOR t IN SELECT DISTINCT tenant_id FROM requirements LOOP
        counter := 1;
        FOR r IN SELECT id FROM requirements WHERE tenant_id = t.tenant_id AND display_id IS NULL ORDER BY created_at LOOP
            UPDATE requirements SET display_id = counter WHERE id = r.id;
            counter := counter + 1;
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- 15. INDEX FOR PRIORITY SORTING
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sets_priority ON sets(tenant_id, priority_score) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_priority ON requirements(tenant_id, priority_score) WHERE deleted_at IS NULL;
