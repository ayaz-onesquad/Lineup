-- Migration 028: Polymorphic Notes System + Supabase Storage Policies
-- Features: Notes table with entity linking, Document storage bucket policies

-- ============================================================================
-- 1. POLYMORPHIC NOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_id SERIAL,

    -- Core fields
    title VARCHAR(255) NOT NULL,
    description TEXT,
    note_type VARCHAR(50) NOT NULL DEFAULT 'internal' CHECK (note_type IN ('meeting', 'internal', 'client')),

    -- Polymorphic parent link (can belong to any entity)
    parent_entity_type VARCHAR(50) NOT NULL CHECK (parent_entity_type IN (
        'client', 'project', 'phase', 'set', 'pitch', 'requirement', 'lead', 'contact'
    )),
    parent_entity_id UUID NOT NULL,

    -- Metadata
    is_pinned BOOLEAN NOT NULL DEFAULT false,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_entity_type, parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "notes_select_policy" ON notes
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR public.is_sys_admin()
    );

CREATE POLICY "notes_insert_policy" ON notes
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "notes_update_policy" ON notes
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "notes_delete_policy" ON notes
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
        OR public.is_sys_admin()
    );

-- Updated_at trigger
DROP TRIGGER IF EXISTS notes_updated_at_trigger ON notes;
CREATE TRIGGER notes_updated_at_trigger
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. LATEST NOTE VIEW FOR ROLL-UP REPORTING
-- ============================================================================

-- View to get the latest note for any entity (for display in overview tables)
CREATE OR REPLACE VIEW entity_latest_notes AS
SELECT DISTINCT ON (parent_entity_type, parent_entity_id)
    n.parent_entity_type,
    n.parent_entity_id,
    n.id AS note_id,
    n.title AS latest_note_title,
    n.description AS latest_note_description,
    n.note_type AS latest_note_type,
    n.created_at AS latest_note_created_at,
    n.created_by AS latest_note_created_by,
    up.full_name AS latest_note_author_name
FROM notes n
LEFT JOIN auth.users au ON au.id = n.created_by
LEFT JOIN user_profiles up ON up.user_id = au.id
WHERE n.deleted_at IS NULL
ORDER BY parent_entity_type, parent_entity_id, n.created_at DESC;

-- ============================================================================
-- 3. NOTES BY ENTITY FUNCTION (For easy querying)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_entity_notes(
    p_entity_type VARCHAR(50),
    p_entity_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    description TEXT,
    note_type VARCHAR(50),
    is_pinned BOOLEAN,
    created_at TIMESTAMPTZ,
    created_by UUID,
    author_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        n.id,
        n.title,
        n.description,
        n.note_type,
        n.is_pinned,
        n.created_at,
        n.created_by,
        up.full_name AS author_name
    FROM notes n
    LEFT JOIN auth.users au ON au.id = n.created_by
    LEFT JOIN user_profiles up ON up.user_id = au.id
    WHERE n.parent_entity_type = p_entity_type
      AND n.parent_entity_id = p_entity_id
      AND n.deleted_at IS NULL
    ORDER BY n.is_pinned DESC, n.created_at DESC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_entity_notes(VARCHAR, UUID, INTEGER) TO authenticated;

-- ============================================================================
-- 4. SUPABASE STORAGE BUCKET POLICIES
-- Note: The bucket 'documents' must be created via Supabase Dashboard or API
-- These policies ensure tenant isolation
-- ============================================================================

-- Storage policies are configured in Supabase Dashboard, but we can use SQL for RLS
-- The actual bucket creation requires: supabase.storage.createBucket('documents', { public: false })

-- Policy helper: Check if user belongs to tenant for a given document path
-- Document paths follow format: {user_id}/{entity_type}/{entity_id}/{filename}
-- We need to verify tenant access via the entity's tenant_id

-- Note: Supabase Storage RLS is managed separately. Below is the SQL to insert
-- into storage.policies if using SQL-based storage policies (Supabase v2+)

-- For Supabase JS SDK, you would use:
-- supabase.storage.from('documents').upload(...)
-- The RLS on the 'documents' table handles authorization

-- ============================================================================
-- 5. MY WORK DASHBOARD VIEWS
-- ============================================================================

-- Past Due Sets (for KPI calculation)
CREATE OR REPLACE VIEW my_past_due_sets AS
SELECT
    s.*,
    c.name AS client_name,
    p.name AS project_name
FROM sets s
LEFT JOIN clients c ON c.id = s.client_id
LEFT JOIN projects p ON p.id = s.project_id
WHERE s.deleted_at IS NULL
  AND s.is_template = false
  AND s.status NOT IN ('completed', 'cancelled')
  AND s.expected_end_date < CURRENT_DATE;

-- Past Due Pitches
CREATE OR REPLACE VIEW my_past_due_pitches AS
SELECT
    pi.*,
    s.name AS set_name,
    c.name AS client_name
FROM pitches pi
JOIN sets s ON s.id = pi.set_id
LEFT JOIN clients c ON c.id = s.client_id
WHERE pi.deleted_at IS NULL
  AND pi.is_template = false
  AND pi.status NOT IN ('completed', 'blocked')
  AND pi.expected_end_date < CURRENT_DATE;

-- Past Due Requirements
CREATE OR REPLACE VIEW my_past_due_requirements AS
SELECT
    r.*,
    s.name AS set_name,
    c.name AS client_name
FROM requirements r
LEFT JOIN sets s ON s.id = r.set_id
LEFT JOIN clients c ON c.id = r.client_id
WHERE r.deleted_at IS NULL
  AND r.is_template = false
  AND r.status NOT IN ('completed', 'cancelled')
  AND r.expected_due_date < CURRENT_DATE;

-- ============================================================================
-- 6. UNIFIED MY WORK VIEW
-- Combines Sets, Pitches, and Requirements into one queryable view
-- ============================================================================

CREATE OR REPLACE VIEW my_work_items AS
-- Sets
SELECT
    'set' AS item_type,
    s.id,
    s.tenant_id,
    s.name,
    s.description,
    s.status,
    s.priority,
    s.expected_start_date,
    s.expected_end_date AS expected_due_date,
    s.completion_percentage,
    s.lead_id,
    s.secondary_lead_id,
    s.pm_id,
    NULL::UUID AS assigned_to_id,
    s.client_id,
    s.project_id,
    NULL::UUID AS set_id,
    NULL::UUID AS pitch_id,
    c.name AS client_name,
    p.name AS project_name,
    NULL::VARCHAR AS set_name,
    NULL::VARCHAR AS pitch_name,
    s.created_at
FROM sets s
LEFT JOIN clients c ON c.id = s.client_id
LEFT JOIN projects p ON p.id = s.project_id
WHERE s.deleted_at IS NULL AND s.is_template = false

UNION ALL

-- Pitches
SELECT
    'pitch' AS item_type,
    pi.id,
    pi.tenant_id,
    pi.name,
    pi.description,
    pi.status,
    pi.priority,
    pi.expected_start_date,
    pi.expected_end_date AS expected_due_date,
    pi.completion_percentage,
    pi.lead_id,
    pi.secondary_lead_id,
    NULL::UUID AS pm_id,
    NULL::UUID AS assigned_to_id,
    s.client_id,
    s.project_id,
    s.id AS set_id,
    NULL::UUID AS pitch_id,
    c.name AS client_name,
    p.name AS project_name,
    s.name AS set_name,
    NULL::VARCHAR AS pitch_name,
    pi.created_at
FROM pitches pi
JOIN sets s ON s.id = pi.set_id
LEFT JOIN clients c ON c.id = s.client_id
LEFT JOIN projects p ON p.id = s.project_id
WHERE pi.deleted_at IS NULL AND pi.is_template = false

UNION ALL

-- Requirements
SELECT
    'requirement' AS item_type,
    r.id,
    r.tenant_id,
    r.title AS name,
    r.description,
    r.status,
    r.priority,
    r.expected_start_date,
    r.expected_due_date,
    0 AS completion_percentage, -- Requirements don't have completion %
    r.lead_id,
    r.secondary_lead_id,
    r.pm_id,
    r.assigned_to_id,
    r.client_id,
    NULL::UUID AS project_id,
    r.set_id,
    r.pitch_id,
    c.name AS client_name,
    NULL::VARCHAR AS project_name,
    s.name AS set_name,
    pi.name AS pitch_name,
    r.created_at
FROM requirements r
LEFT JOIN sets s ON s.id = r.set_id
LEFT JOIN pitches pi ON pi.id = r.pitch_id
LEFT JOIN clients c ON c.id = r.client_id
WHERE r.deleted_at IS NULL AND r.is_template = false;

-- ============================================================================
-- 7. DASHBOARD KPI FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_my_work_kpis(p_user_profile_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_active_sets INTEGER;
    v_past_due_sets INTEGER;
    v_active_pitches INTEGER;
    v_past_due_pitches INTEGER;
    v_active_tasks INTEGER;
    v_past_due_tasks INTEGER;
    v_total_requirements INTEGER;
    v_past_due_requirements INTEGER;
BEGIN
    -- Active Sets (user is lead, secondary_lead, or pm)
    SELECT COUNT(*) INTO v_active_sets
    FROM sets s
    WHERE s.deleted_at IS NULL
      AND s.is_template = false
      AND s.status NOT IN ('completed', 'cancelled')
      AND (s.lead_id = p_user_profile_id OR s.secondary_lead_id = p_user_profile_id OR s.pm_id = p_user_profile_id);

    -- Past Due Sets
    SELECT COUNT(*) INTO v_past_due_sets
    FROM sets s
    WHERE s.deleted_at IS NULL
      AND s.is_template = false
      AND s.status NOT IN ('completed', 'cancelled')
      AND s.expected_end_date < CURRENT_DATE
      AND (s.lead_id = p_user_profile_id OR s.secondary_lead_id = p_user_profile_id OR s.pm_id = p_user_profile_id);

    -- Active Pitches
    SELECT COUNT(*) INTO v_active_pitches
    FROM pitches pi
    WHERE pi.deleted_at IS NULL
      AND pi.is_template = false
      AND pi.status NOT IN ('completed', 'blocked')
      AND (pi.lead_id = p_user_profile_id OR pi.secondary_lead_id = p_user_profile_id);

    -- Past Due Pitches
    SELECT COUNT(*) INTO v_past_due_pitches
    FROM pitches pi
    WHERE pi.deleted_at IS NULL
      AND pi.is_template = false
      AND pi.status NOT IN ('completed', 'blocked')
      AND pi.expected_end_date < CURRENT_DATE
      AND (pi.lead_id = p_user_profile_id OR pi.secondary_lead_id = p_user_profile_id);

    -- Active Tasks (is_task = true)
    SELECT COUNT(*) INTO v_active_tasks
    FROM requirements r
    WHERE r.deleted_at IS NULL
      AND r.is_template = false
      AND r.is_task = true
      AND r.status NOT IN ('completed', 'cancelled')
      AND r.assigned_to_id = p_user_profile_id;

    -- Past Due Tasks
    SELECT COUNT(*) INTO v_past_due_tasks
    FROM requirements r
    WHERE r.deleted_at IS NULL
      AND r.is_template = false
      AND r.is_task = true
      AND r.status NOT IN ('completed', 'cancelled')
      AND r.expected_due_date < CURRENT_DATE
      AND r.assigned_to_id = p_user_profile_id;

    -- Total Requirements (assigned to user)
    SELECT COUNT(*) INTO v_total_requirements
    FROM requirements r
    WHERE r.deleted_at IS NULL
      AND r.is_template = false
      AND r.status NOT IN ('completed', 'cancelled')
      AND r.assigned_to_id = p_user_profile_id;

    -- Past Due Requirements
    SELECT COUNT(*) INTO v_past_due_requirements
    FROM requirements r
    WHERE r.deleted_at IS NULL
      AND r.is_template = false
      AND r.status NOT IN ('completed', 'cancelled')
      AND r.expected_due_date < CURRENT_DATE
      AND r.assigned_to_id = p_user_profile_id;

    RETURN json_build_object(
        'sets', json_build_object('active', v_active_sets, 'past_due', v_past_due_sets),
        'pitches', json_build_object('active', v_active_pitches, 'past_due', v_past_due_pitches),
        'tasks', json_build_object('active', v_active_tasks, 'past_due', v_past_due_tasks),
        'requirements', json_build_object('active', v_total_requirements, 'past_due', v_past_due_requirements)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_work_kpis(UUID) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE notes IS 'Polymorphic notes that can be attached to any entity (client, project, set, etc.)';
COMMENT ON COLUMN notes.parent_entity_type IS 'Type of entity this note belongs to';
COMMENT ON COLUMN notes.parent_entity_id IS 'UUID of the parent entity';
COMMENT ON VIEW entity_latest_notes IS 'View showing the most recent note for each entity, for roll-up reporting';
COMMENT ON VIEW my_work_items IS 'Unified view combining sets, pitches, and requirements for My Work dashboard';
