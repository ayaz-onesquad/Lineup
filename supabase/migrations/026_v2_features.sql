-- Migration 026: V2 Features Batch
-- 48-Hour Sprint Implementation
-- Features: Document Catalog, Enhanced Documents, Project Phases (enhanced), Pitches, Templates, Leads
-- Priority: Parent-Child enforcement + IsTemplate filtering

-- ============================================================================
-- 1. DOCUMENT CATALOG (Tenant-wide document type standards)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_id SERIAL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('deliverable', 'legal', 'internal', 'reference')),
    is_client_deliverable BOOLEAN NOT NULL DEFAULT false,
    file_type_hint VARCHAR(50), -- e.g., 'pdf', 'docx', 'image'
    is_active BOOLEAN NOT NULL DEFAULT true,
    usage_count INTEGER NOT NULL DEFAULT 0, -- Tracked via trigger
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_catalog_tenant_id ON document_catalog(tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_catalog_category ON document_catalog(category);
CREATE INDEX IF NOT EXISTS idx_document_catalog_is_active ON document_catalog(is_active);

-- Enable RLS
ALTER TABLE document_catalog ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "document_catalog_select_policy" ON document_catalog
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR public.is_sys_admin()
    );

CREATE POLICY "document_catalog_insert_policy" ON document_catalog
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "document_catalog_update_policy" ON document_catalog
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "document_catalog_delete_policy" ON document_catalog
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Seed default catalog types function (called on tenant creation)
CREATE OR REPLACE FUNCTION seed_document_catalog_for_tenant(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO document_catalog (tenant_id, name, description, category, is_client_deliverable, file_type_hint)
    VALUES
        (p_tenant_id, 'Logo', 'Company or project logo files', 'deliverable', true, 'image'),
        (p_tenant_id, 'Brand Guide', 'Brand guidelines and style guide', 'deliverable', true, 'pdf'),
        (p_tenant_id, 'Contract', 'Legal contracts and agreements', 'legal', false, 'pdf'),
        (p_tenant_id, 'NDA', 'Non-disclosure agreements', 'legal', false, 'pdf'),
        (p_tenant_id, 'Invoice', 'Client invoices', 'legal', true, 'pdf'),
        (p_tenant_id, 'Proposal', 'Project proposals', 'deliverable', true, 'pdf'),
        (p_tenant_id, 'Technical Spec', 'Technical specifications', 'reference', false, 'pdf'),
        (p_tenant_id, 'Meeting Notes', 'Meeting notes and minutes', 'internal', false, 'docx'),
        (p_tenant_id, 'Wireframe', 'UI/UX wireframes', 'deliverable', true, 'image'),
        (p_tenant_id, 'Mockup', 'Design mockups', 'deliverable', true, 'image'),
        (p_tenant_id, 'Screenshot', 'Screenshots and screen captures', 'reference', false, 'image'),
        (p_tenant_id, 'SOW', 'Statement of Work', 'legal', true, 'pdf'),
        (p_tenant_id, 'Report', 'Project reports and analysis', 'deliverable', true, 'pdf'),
        (p_tenant_id, 'Presentation', 'Slide decks and presentations', 'deliverable', true, 'pptx'),
        (p_tenant_id, 'Asset', 'General project assets', 'deliverable', true, NULL)
    ON CONFLICT (tenant_id, name) DO NOTHING;
END;
$$;

-- ============================================================================
-- 2. ENHANCED DOCUMENTS (Links to phases/pitches, requires catalog)
-- ============================================================================

-- Add new columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_catalog_id UUID REFERENCES document_catalog(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES project_phases(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pitch_id UUID; -- FK added after pitches table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS has_file BOOLEAN GENERATED ALWAYS AS (file_url IS NOT NULL) STORED;

-- Index for catalog filtering
CREATE INDEX IF NOT EXISTS idx_documents_catalog_id ON documents(document_catalog_id);
CREATE INDEX IF NOT EXISTS idx_documents_phase_id ON documents(phase_id);

-- Trigger to update document_catalog usage_count
CREATE OR REPLACE FUNCTION update_document_catalog_usage_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.document_catalog_id IS NOT NULL THEN
        UPDATE document_catalog SET usage_count = usage_count + 1 WHERE id = NEW.document_catalog_id;
    ELSIF TG_OP = 'DELETE' AND OLD.document_catalog_id IS NOT NULL THEN
        UPDATE document_catalog SET usage_count = usage_count - 1 WHERE id = OLD.document_catalog_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.document_catalog_id IS DISTINCT FROM NEW.document_catalog_id THEN
            IF OLD.document_catalog_id IS NOT NULL THEN
                UPDATE document_catalog SET usage_count = usage_count - 1 WHERE id = OLD.document_catalog_id;
            END IF;
            IF NEW.document_catalog_id IS NOT NULL THEN
                UPDATE document_catalog SET usage_count = usage_count + 1 WHERE id = NEW.document_catalog_id;
            END IF;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS documents_catalog_usage_trigger ON documents;
CREATE TRIGGER documents_catalog_usage_trigger
    AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_document_catalog_usage_count();

-- ============================================================================
-- 3. ENHANCED PROJECT PHASES
-- ============================================================================

-- Add new columns to project_phases
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS phase_id_display VARCHAR(20);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES user_profiles(id);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS secondary_lead_id UUID REFERENCES user_profiles(id);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS order_key NUMERIC(10,4) NOT NULL DEFAULT 0;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS order_manual INTEGER;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS predecessor_phase_id UUID REFERENCES project_phases(id);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS successor_phase_id UUID REFERENCES project_phases(id);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS importance VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high'));
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 6);
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- Drop owner_id if exists (being replaced by lead_id)
-- Keeping for backwards compatibility - can be migrated later

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_phases_order_key ON project_phases(order_key);
CREATE INDEX IF NOT EXISTS idx_project_phases_lead_id ON project_phases(lead_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_is_template ON project_phases(is_template);
CREATE INDEX IF NOT EXISTS idx_project_phases_status ON project_phases(status);

-- Phase order calculation trigger
CREATE OR REPLACE FUNCTION calculate_phase_order_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pred_order NUMERIC;
    v_succ_order NUMERIC;
BEGIN
    -- Manual order takes priority
    IF NEW.order_manual IS NOT NULL THEN
        NEW.order_key := NEW.order_manual;
        RETURN NEW;
    END IF;

    -- Calculate from predecessor/successor
    IF NEW.predecessor_phase_id IS NOT NULL THEN
        SELECT order_key INTO v_pred_order FROM project_phases WHERE id = NEW.predecessor_phase_id;
        IF v_pred_order IS NOT NULL THEN
            NEW.order_key := v_pred_order + 1;
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.successor_phase_id IS NOT NULL THEN
        SELECT order_key INTO v_succ_order FROM project_phases WHERE id = NEW.successor_phase_id;
        IF v_succ_order IS NOT NULL THEN
            NEW.order_key := v_succ_order - 1;
            RETURN NEW;
        END IF;
    END IF;

    -- Default: append to end
    SELECT COALESCE(MAX(order_key), 0) + 1 INTO NEW.order_key
    FROM project_phases
    WHERE project_id = NEW.project_id AND deleted_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_phase_order_key_trigger ON project_phases;
CREATE TRIGGER calculate_phase_order_key_trigger
    BEFORE INSERT OR UPDATE OF order_manual, predecessor_phase_id, successor_phase_id ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_phase_order_key();

-- Phase Eisenhower priority trigger
CREATE OR REPLACE FUNCTION calculate_phase_priority()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Eisenhower Matrix: urgency x importance
    NEW.priority := CASE
        WHEN NEW.importance = 'high' AND NEW.urgency = 'critical' THEN 1
        WHEN NEW.importance = 'high' AND NEW.urgency = 'high' THEN 2
        WHEN NEW.importance = 'high' AND NEW.urgency = 'medium' THEN 3
        WHEN NEW.importance = 'medium' AND NEW.urgency IN ('high', 'critical') THEN 3
        WHEN NEW.importance = 'medium' AND NEW.urgency = 'medium' THEN 4
        WHEN NEW.importance = 'medium' AND NEW.urgency = 'low' THEN 5
        WHEN NEW.importance = 'low' THEN 6
        ELSE 4
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_phase_priority_trigger ON project_phases;
CREATE TRIGGER calculate_phase_priority_trigger
    BEFORE INSERT OR UPDATE OF urgency, importance ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_phase_priority();

-- Prevent circular phase dependencies
CREATE OR REPLACE FUNCTION check_phase_circular_dependency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_visited UUID[] := ARRAY[NEW.id];
    v_current UUID;
    v_next UUID;
BEGIN
    -- Check predecessor chain
    v_current := NEW.predecessor_phase_id;
    WHILE v_current IS NOT NULL LOOP
        IF v_current = ANY(v_visited) THEN
            RAISE EXCEPTION 'Circular dependency detected in phase predecessors';
        END IF;
        v_visited := array_append(v_visited, v_current);
        SELECT predecessor_phase_id INTO v_next FROM project_phases WHERE id = v_current;
        v_current := v_next;
    END LOOP;

    -- Check successor chain
    v_visited := ARRAY[NEW.id];
    v_current := NEW.successor_phase_id;
    WHILE v_current IS NOT NULL LOOP
        IF v_current = ANY(v_visited) THEN
            RAISE EXCEPTION 'Circular dependency detected in phase successors';
        END IF;
        v_visited := array_append(v_visited, v_current);
        SELECT successor_phase_id INTO v_next FROM project_phases WHERE id = v_current;
        v_current := v_next;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_phase_circular_dependency_trigger ON project_phases;
CREATE TRIGGER check_phase_circular_dependency_trigger
    BEFORE INSERT OR UPDATE OF predecessor_phase_id, successor_phase_id ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION check_phase_circular_dependency();

-- ============================================================================
-- 4. PITCHES (New entity between Set and Requirement)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pitches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    set_id UUID NOT NULL REFERENCES sets(id) ON DELETE CASCADE, -- MUST have set_id (parent-child enforced)
    display_id SERIAL,
    pitch_id_display VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    lead_id UUID REFERENCES user_profiles(id),
    secondary_lead_id UUID REFERENCES user_profiles(id),
    order_key NUMERIC(10,4) NOT NULL DEFAULT 0,
    order_manual INTEGER,
    predecessor_pitch_id UUID REFERENCES pitches(id),
    successor_pitch_id UUID REFERENCES pitches(id),
    expected_start_date DATE,
    expected_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    urgency VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    importance VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high')),
    priority INTEGER NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 6),
    status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'on_hold')),
    completion_percentage INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_by_id UUID REFERENCES user_profiles(id),
    approved_at TIMESTAMPTZ,
    show_in_client_portal BOOLEAN NOT NULL DEFAULT false,
    is_template BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,
    -- Constraint: If approved, must have approver and date
    CONSTRAINT pitches_approval_check CHECK (
        (is_approved = false) OR (is_approved = true AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pitches_tenant_id ON pitches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pitches_set_id ON pitches(set_id);
CREATE INDEX IF NOT EXISTS idx_pitches_order_key ON pitches(order_key);
CREATE INDEX IF NOT EXISTS idx_pitches_status ON pitches(status);
CREATE INDEX IF NOT EXISTS idx_pitches_is_approved ON pitches(is_approved);
CREATE INDEX IF NOT EXISTS idx_pitches_is_template ON pitches(is_template);
CREATE INDEX IF NOT EXISTS idx_pitches_lead_id ON pitches(lead_id);

-- Enable RLS
ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "pitches_select_policy" ON pitches
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_insert_policy" ON pitches
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_update_policy" ON pitches
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_delete_policy" ON pitches
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Now add FK from documents to pitches
ALTER TABLE documents ADD CONSTRAINT documents_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES pitches(id);
CREATE INDEX IF NOT EXISTS idx_documents_pitch_id ON documents(pitch_id);

-- Pitch order calculation trigger (same logic as phases)
CREATE OR REPLACE FUNCTION calculate_pitch_order_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pred_order NUMERIC;
    v_succ_order NUMERIC;
BEGIN
    IF NEW.order_manual IS NOT NULL THEN
        NEW.order_key := NEW.order_manual;
        RETURN NEW;
    END IF;

    IF NEW.predecessor_pitch_id IS NOT NULL THEN
        SELECT order_key INTO v_pred_order FROM pitches WHERE id = NEW.predecessor_pitch_id;
        IF v_pred_order IS NOT NULL THEN
            NEW.order_key := v_pred_order + 1;
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.successor_pitch_id IS NOT NULL THEN
        SELECT order_key INTO v_succ_order FROM pitches WHERE id = NEW.successor_pitch_id;
        IF v_succ_order IS NOT NULL THEN
            NEW.order_key := v_succ_order - 1;
            RETURN NEW;
        END IF;
    END IF;

    SELECT COALESCE(MAX(order_key), 0) + 1 INTO NEW.order_key
    FROM pitches
    WHERE set_id = NEW.set_id AND deleted_at IS NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_pitch_order_key_trigger ON pitches;
CREATE TRIGGER calculate_pitch_order_key_trigger
    BEFORE INSERT OR UPDATE OF order_manual, predecessor_pitch_id, successor_pitch_id ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION calculate_pitch_order_key();

-- Pitch Eisenhower priority trigger
DROP TRIGGER IF EXISTS calculate_pitch_priority_trigger ON pitches;
CREATE TRIGGER calculate_pitch_priority_trigger
    BEFORE INSERT OR UPDATE OF urgency, importance ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION calculate_phase_priority(); -- Reuse same logic

-- Add pitch_id to requirements (optional link)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS pitch_id UUID REFERENCES pitches(id);
CREATE INDEX IF NOT EXISTS idx_requirements_pitch_id ON requirements(pitch_id);

-- Update updated_at trigger for pitches
DROP TRIGGER IF EXISTS pitches_updated_at_trigger ON pitches;
CREATE TRIGGER pitches_updated_at_trigger
    BEFORE UPDATE ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. TEMPLATES (is_template flag on major entities)
-- ============================================================================

-- Add is_template to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_projects_is_template ON projects(is_template);

-- Add is_template to sets
ALTER TABLE sets ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sets_is_template ON sets(is_template);

-- Add is_template to requirements
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_requirements_is_template ON requirements(is_template);

-- View for non-template projects (operational projects only)
CREATE OR REPLACE VIEW operational_projects AS
SELECT * FROM projects WHERE is_template = false AND deleted_at IS NULL;

-- View for non-template sets (operational sets only)
CREATE OR REPLACE VIEW operational_sets AS
SELECT * FROM sets WHERE is_template = false AND deleted_at IS NULL;

-- View for non-template requirements (operational requirements only)
CREATE OR REPLACE VIEW operational_requirements AS
SELECT * FROM requirements WHERE is_template = false AND deleted_at IS NULL;

-- View for non-template phases (operational phases only)
CREATE OR REPLACE VIEW operational_phases AS
SELECT * FROM project_phases WHERE is_template = false AND deleted_at IS NULL;

-- View for non-template pitches (operational pitches only)
CREATE OR REPLACE VIEW operational_pitches AS
SELECT * FROM pitches WHERE is_template = false AND deleted_at IS NULL;

-- ============================================================================
-- 6. LEADS (Sales Pipeline)
-- ============================================================================

-- Lead status enum
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- Company size enum
CREATE TYPE company_size AS ENUM ('1-10', '11-50', '51-200', '201-500', '500+');

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_id SERIAL,
    lead_id_display VARCHAR(20),
    lead_name VARCHAR(255) NOT NULL,
    description TEXT,
    status lead_status NOT NULL DEFAULT 'new',
    industry VARCHAR(100), -- Using VARCHAR instead of FK to industries table
    website VARCHAR(500),
    phone VARCHAR(50),
    email VARCHAR(255),
    company_size company_size,
    estimated_value NUMERIC(15,2),
    estimated_close_date DATE,
    source VARCHAR(50) CHECK (source IN ('referral', 'website', 'social_media', 'advertising', 'event', 'partner', 'cold_outreach', 'other')),
    lead_owner_id UUID REFERENCES user_profiles(id),
    converted_to_client_id UUID REFERENCES clients(id),
    converted_at TIMESTAMPTZ,
    lost_reason VARCHAR(100),
    lost_reason_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,
    -- Constraint: If won, must have converted client
    CONSTRAINT leads_won_check CHECK (
        (status != 'won') OR (status = 'won' AND converted_to_client_id IS NOT NULL AND converted_at IS NOT NULL)
    ),
    -- Constraint: If lost, must have lost reason
    CONSTRAINT leads_lost_check CHECK (
        (status != 'lost') OR (status = 'lost' AND lost_reason IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_owner_id ON leads(lead_owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_to_client_id ON leads(converted_to_client_id);
CREATE INDEX IF NOT EXISTS idx_leads_estimated_close_date ON leads(estimated_close_date);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "leads_select_policy" ON leads
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_insert_policy" ON leads
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_update_policy" ON leads
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "leads_delete_policy" ON leads
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Lead contacts junction table
CREATE TABLE IF NOT EXISTS lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_decision_maker BOOLEAN NOT NULL DEFAULT false,
    role_at_lead VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ,
    UNIQUE(lead_id, contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_contacts_tenant_id ON lead_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead_id ON lead_contacts(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_contact_id ON lead_contacts(contact_id);

-- Enable RLS
ALTER TABLE lead_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies (same as leads)
CREATE POLICY "lead_contacts_select_policy" ON lead_contacts
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_insert_policy" ON lead_contacts
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_update_policy" ON lead_contacts
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "lead_contacts_delete_policy" ON lead_contacts
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Trigger to ensure only one primary contact per lead
CREATE OR REPLACE FUNCTION ensure_single_primary_lead_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_primary = true THEN
        UPDATE lead_contacts
        SET is_primary = false
        WHERE lead_id = NEW.lead_id
        AND id != NEW.id
        AND is_primary = true;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_single_primary_lead_contact_trigger ON lead_contacts;
CREATE TRIGGER ensure_single_primary_lead_contact_trigger
    AFTER INSERT OR UPDATE OF is_primary ON lead_contacts
    FOR EACH ROW
    WHEN (NEW.is_primary = true)
    EXECUTE FUNCTION ensure_single_primary_lead_contact();

-- Auto-populate tenant_id from lead
CREATE OR REPLACE FUNCTION set_lead_contacts_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        SELECT tenant_id INTO NEW.tenant_id FROM leads WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_contacts_set_tenant_id_trigger ON lead_contacts;
CREATE TRIGGER lead_contacts_set_tenant_id_trigger
    BEFORE INSERT ON lead_contacts
    FOR EACH ROW
    EXECUTE FUNCTION set_lead_contacts_tenant_id();

-- Updated_at triggers
DROP TRIGGER IF EXISTS leads_updated_at_trigger ON leads;
CREATE TRIGGER leads_updated_at_trigger
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS lead_contacts_updated_at_trigger ON lead_contacts;
CREATE TRIGGER lead_contacts_updated_at_trigger
    BEFORE UPDATE ON lead_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. CONVERT LEAD TO CLIENT STORED PROCEDURE
-- ============================================================================

CREATE OR REPLACE FUNCTION convert_lead_to_client(
    p_lead_id UUID,
    p_client_name VARCHAR(255) DEFAULT NULL,
    p_relationship_manager_id UUID DEFAULT NULL,
    p_copy_contacts BOOLEAN DEFAULT true,
    p_copy_documents BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead RECORD;
    v_client_id UUID;
    v_contact_mapping JSON := '[]'::JSON;
BEGIN
    -- Get lead
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND deleted_at IS NULL;

    IF v_lead IS NULL THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    IF v_lead.status = 'won' THEN
        RAISE EXCEPTION 'Lead already converted';
    END IF;

    -- Create client
    INSERT INTO clients (
        tenant_id, name, company_name, overview, status,
        relationship_manager_id, referral_source, created_by
    ) VALUES (
        v_lead.tenant_id,
        COALESCE(p_client_name, v_lead.lead_name),
        COALESCE(p_client_name, v_lead.lead_name),
        v_lead.description,
        'onboarding',
        p_relationship_manager_id,
        v_lead.source::referral_source,
        auth.uid()
    )
    RETURNING id INTO v_client_id;

    -- Copy contacts if requested
    IF p_copy_contacts THEN
        INSERT INTO client_contacts (tenant_id, client_id, contact_id, is_primary, role, created_by)
        SELECT
            v_lead.tenant_id,
            v_client_id,
            lc.contact_id,
            lc.is_primary,
            lc.role_at_lead,
            auth.uid()
        FROM lead_contacts lc
        WHERE lc.lead_id = p_lead_id AND lc.deleted_at IS NULL;
    END IF;

    -- Copy documents if requested
    IF p_copy_documents THEN
        INSERT INTO documents (
            tenant_id, name, description, file_url, file_type, file_size_bytes,
            entity_type, entity_id, document_catalog_id, uploaded_by
        )
        SELECT
            tenant_id, name, description, file_url, file_type, file_size_bytes,
            'client', v_client_id, document_catalog_id, auth.uid()
        FROM documents
        WHERE entity_type = 'lead' AND entity_id = p_lead_id AND deleted_at IS NULL;
    END IF;

    -- Update lead status to won
    UPDATE leads
    SET status = 'won',
        converted_to_client_id = v_client_id,
        converted_at = NOW(),
        updated_by = auth.uid()
    WHERE id = p_lead_id;

    RETURN json_build_object(
        'lead_id', p_lead_id,
        'client_id', v_client_id,
        'success', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION convert_lead_to_client(UUID, VARCHAR, UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- ============================================================================
-- 8. TEMPLATE DEEP COPY PROCEDURES
-- ============================================================================

-- Duplicate project with all children
CREATE OR REPLACE FUNCTION duplicate_project(
    p_project_id UUID,
    p_new_client_id UUID DEFAULT NULL,
    p_new_name VARCHAR(255) DEFAULT NULL,
    p_include_children BOOLEAN DEFAULT true,
    p_clear_dates BOOLEAN DEFAULT false,
    p_clear_assignments BOOLEAN DEFAULT false,
    p_as_template BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_project RECORD;
    v_new_project_id UUID;
    v_phase_mapping JSONB := '{}'::JSONB;
    v_set_mapping JSONB := '{}'::JSONB;
    v_pitch_mapping JSONB := '{}'::JSONB;
    v_old_phase RECORD;
    v_new_phase_id UUID;
    v_old_set RECORD;
    v_new_set_id UUID;
    v_old_pitch RECORD;
    v_new_pitch_id UUID;
    v_old_req RECORD;
BEGIN
    -- Get source project
    SELECT * INTO v_project FROM projects WHERE id = p_project_id AND deleted_at IS NULL;

    IF v_project IS NULL THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    -- Create new project
    INSERT INTO projects (
        tenant_id, client_id, name, description, project_code,
        lead_id, secondary_lead_id, pm_id, status, health,
        expected_start_date, expected_end_date, show_in_client_portal, is_template, created_by
    ) VALUES (
        v_project.tenant_id,
        COALESCE(p_new_client_id, v_project.client_id),
        COALESCE(p_new_name, v_project.name || ' (Copy)'),
        v_project.description,
        v_project.project_code || '-COPY',
        CASE WHEN p_clear_assignments THEN NULL ELSE v_project.lead_id END,
        CASE WHEN p_clear_assignments THEN NULL ELSE v_project.secondary_lead_id END,
        CASE WHEN p_clear_assignments THEN NULL ELSE v_project.pm_id END,
        'planning',
        'on_track',
        CASE WHEN p_clear_dates THEN NULL ELSE v_project.expected_start_date END,
        CASE WHEN p_clear_dates THEN NULL ELSE v_project.expected_end_date END,
        v_project.show_in_client_portal,
        p_as_template,
        auth.uid()
    )
    RETURNING id INTO v_new_project_id;

    -- Copy phases if requested
    IF p_include_children THEN
        FOR v_old_phase IN SELECT * FROM project_phases WHERE project_id = p_project_id AND deleted_at IS NULL ORDER BY order_key
        LOOP
            INSERT INTO project_phases (
                tenant_id, project_id, name, description, phase_order, status,
                lead_id, secondary_lead_id, urgency, importance,
                expected_start_date, expected_end_date, show_in_client_portal, is_template, created_by
            ) VALUES (
                v_old_phase.tenant_id, v_new_project_id, v_old_phase.name, v_old_phase.description,
                v_old_phase.phase_order, 'not_started',
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_phase.lead_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_phase.secondary_lead_id END,
                v_old_phase.urgency, v_old_phase.importance,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_phase.expected_start_date END,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_phase.expected_end_date END,
                v_old_phase.show_in_client_portal, p_as_template, auth.uid()
            )
            RETURNING id INTO v_new_phase_id;

            v_phase_mapping := v_phase_mapping || jsonb_build_object(v_old_phase.id::text, v_new_phase_id);
        END LOOP;

        -- Copy sets
        FOR v_old_set IN SELECT * FROM sets WHERE project_id = p_project_id AND deleted_at IS NULL ORDER BY set_order
        LOOP
            INSERT INTO sets (
                tenant_id, client_id, project_id, phase_id, name, description, set_order, status,
                lead_id, secondary_lead_id, pm_id, urgency, importance, budget_days, budget_hours,
                expected_start_date, expected_end_date, show_in_client_portal, is_template, created_by
            ) VALUES (
                v_old_set.tenant_id,
                COALESCE(p_new_client_id, v_old_set.client_id),
                v_new_project_id,
                (v_phase_mapping->>v_old_set.phase_id::text)::UUID,
                v_old_set.name, v_old_set.description, v_old_set.set_order, 'open',
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_set.lead_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_set.secondary_lead_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_set.pm_id END,
                v_old_set.urgency, v_old_set.importance,
                v_old_set.budget_days, v_old_set.budget_hours,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_set.expected_start_date END,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_set.expected_end_date END,
                v_old_set.show_in_client_portal, p_as_template, auth.uid()
            )
            RETURNING id INTO v_new_set_id;

            v_set_mapping := v_set_mapping || jsonb_build_object(v_old_set.id::text, v_new_set_id);

            -- Copy pitches for this set
            FOR v_old_pitch IN SELECT * FROM pitches WHERE set_id = v_old_set.id AND deleted_at IS NULL ORDER BY order_key
            LOOP
                INSERT INTO pitches (
                    tenant_id, set_id, name, description, lead_id, secondary_lead_id,
                    urgency, importance, expected_start_date, expected_end_date,
                    show_in_client_portal, is_template, created_by
                ) VALUES (
                    v_old_pitch.tenant_id, v_new_set_id, v_old_pitch.name, v_old_pitch.description,
                    CASE WHEN p_clear_assignments THEN NULL ELSE v_old_pitch.lead_id END,
                    CASE WHEN p_clear_assignments THEN NULL ELSE v_old_pitch.secondary_lead_id END,
                    v_old_pitch.urgency, v_old_pitch.importance,
                    CASE WHEN p_clear_dates THEN NULL ELSE v_old_pitch.expected_start_date END,
                    CASE WHEN p_clear_dates THEN NULL ELSE v_old_pitch.expected_end_date END,
                    v_old_pitch.show_in_client_portal, p_as_template, auth.uid()
                )
                RETURNING id INTO v_new_pitch_id;

                v_pitch_mapping := v_pitch_mapping || jsonb_build_object(v_old_pitch.id::text, v_new_pitch_id);
            END LOOP;
        END LOOP;

        -- Copy requirements
        FOR v_old_req IN SELECT * FROM requirements WHERE client_id IN (SELECT client_id FROM sets WHERE project_id = p_project_id) AND deleted_at IS NULL
        LOOP
            INSERT INTO requirements (
                tenant_id, client_id, set_id, pitch_id, title, description,
                requirement_type, urgency, importance, requires_document, requires_review, is_task,
                estimated_hours, assigned_to_id, lead_id, secondary_lead_id, pm_id, reviewer_id,
                expected_start_date, expected_due_date, show_in_client_portal, is_template, created_by
            ) VALUES (
                v_old_req.tenant_id,
                COALESCE(p_new_client_id, v_old_req.client_id),
                (v_set_mapping->>v_old_req.set_id::text)::UUID,
                (v_pitch_mapping->>v_old_req.pitch_id::text)::UUID,
                v_old_req.title, v_old_req.description,
                v_old_req.requirement_type, v_old_req.urgency, v_old_req.importance,
                v_old_req.requires_document, v_old_req.requires_review, v_old_req.is_task,
                v_old_req.estimated_hours,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_req.assigned_to_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_req.lead_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_req.secondary_lead_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_req.pm_id END,
                CASE WHEN p_clear_assignments THEN NULL ELSE v_old_req.reviewer_id END,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_req.expected_start_date END,
                CASE WHEN p_clear_dates THEN NULL ELSE v_old_req.expected_due_date END,
                v_old_req.show_in_client_portal, p_as_template, auth.uid()
            );
        END LOOP;
    END IF;

    RETURN json_build_object(
        'source_project_id', p_project_id,
        'new_project_id', v_new_project_id,
        'phase_count', jsonb_array_length(to_jsonb(array_agg(1) FILTER (WHERE TRUE))),
        'success', true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION duplicate_project(UUID, UUID, VARCHAR, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ============================================================================
-- 9. DISPLAY ID GENERATION
-- ============================================================================

-- Generate phase display ID
CREATE OR REPLACE FUNCTION generate_phase_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.phase_id_display := 'PH-' || LPAD(NEW.display_id::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_phase_display_id_trigger ON project_phases;
CREATE TRIGGER generate_phase_display_id_trigger
    BEFORE INSERT ON project_phases
    FOR EACH ROW
    WHEN (NEW.phase_id_display IS NULL)
    EXECUTE FUNCTION generate_phase_display_id();

-- Generate pitch display ID
CREATE OR REPLACE FUNCTION generate_pitch_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.pitch_id_display := 'PI-' || LPAD(NEW.display_id::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_pitch_display_id_trigger ON pitches;
CREATE TRIGGER generate_pitch_display_id_trigger
    BEFORE INSERT ON pitches
    FOR EACH ROW
    WHEN (NEW.pitch_id_display IS NULL)
    EXECUTE FUNCTION generate_pitch_display_id();

-- Generate lead display ID
CREATE OR REPLACE FUNCTION generate_lead_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.lead_id_display := 'LD-' || LPAD(NEW.display_id::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_lead_display_id_trigger ON leads;
CREATE TRIGGER generate_lead_display_id_trigger
    BEFORE INSERT ON leads
    FOR EACH ROW
    WHEN (NEW.lead_id_display IS NULL)
    EXECUTE FUNCTION generate_lead_display_id();

-- ============================================================================
-- 10. UPDATE ENTITY TYPE ENUM FOR DOCUMENTS
-- ============================================================================

-- Add 'lead' to entity_type if it's an enum, or ensure it's allowed
DO $$
BEGIN
    -- Try to add 'lead' to entity_type enum if it exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
        ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'lead';
        ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'pitch';
    END IF;
EXCEPTION
    WHEN others THEN
        -- If entity_type is not an enum, we're fine (it's probably VARCHAR)
        NULL;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE document_catalog IS 'Tenant-wide document type catalog for standardizing document uploads';
COMMENT ON TABLE pitches IS 'Pitches sit between Sets and Requirements in the hierarchy (Set > Pitch > Requirement)';
COMMENT ON TABLE leads IS 'Sales pipeline tracking for prospective clients';
COMMENT ON TABLE lead_contacts IS 'Junction table linking leads to contacts';
COMMENT ON COLUMN projects.is_template IS 'When true, project is a template and excluded from operational views';
COMMENT ON COLUMN sets.is_template IS 'When true, set is a template and excluded from operational views';
COMMENT ON COLUMN requirements.is_template IS 'When true, requirement is a template and excluded from operational views';
COMMENT ON COLUMN project_phases.is_template IS 'When true, phase is a template and excluded from operational views';
COMMENT ON COLUMN pitches.is_template IS 'When true, pitch is a template and excluded from operational views';
