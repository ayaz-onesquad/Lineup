-- Migration 045: Reactive Date & Status Engine
-- Adds key dates (rippled from children) and computed status logic
-- Implements the "single source of truth" for date/status across all 6 levels

-- ============================================================================
-- 1. ADD KEY DATE COLUMNS TO ALL ENTITIES
-- ============================================================================

-- Projects: key_start_date, key_end_date
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_end_date DATE;

-- Phases: key_start_date, key_end_date
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS key_end_date DATE;

-- Sets: key_start_date, key_end_date
ALTER TABLE sets ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS key_end_date DATE;

-- Pitches: key_start_date, key_end_date
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS key_end_date DATE;

-- Requirements: key_due_date (requirements use due_date instead of end_date)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS key_due_date DATE;

-- ============================================================================
-- 2. ADD COMPUTED STATUS COLUMN TO ALL ENTITIES
-- ============================================================================

-- Computed status values (consistent across all entities)
-- 'completed' - has actual end/completion date
-- 'past_due' - key date has passed without completion
-- 'active' - key start <= today
-- 'on_deck' - key start within 10 days
-- 'future' - key start > 10 days away

ALTER TABLE projects ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS computed_status TEXT;

-- ============================================================================
-- 3. CREATE INDEXES FOR DASHBOARD PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_key_dates ON projects(key_start_date, key_end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phases_key_dates ON project_phases(key_start_date, key_end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sets_key_dates ON sets(key_start_date, key_end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pitches_key_dates ON pitches(key_start_date, key_end_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_key_due_date ON requirements(key_due_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_computed_status ON projects(computed_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_phases_computed_status ON project_phases(computed_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sets_computed_status ON sets(computed_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pitches_computed_status ON pitches(computed_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_computed_status ON requirements(computed_status) WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. COMPUTED STATUS CALCULATION FUNCTION
-- ============================================================================

-- Generic function to compute status based on dates
CREATE OR REPLACE FUNCTION compute_entity_status(
    p_actual_end_date DATE,
    p_key_start_date DATE,
    p_key_end_date DATE,
    p_has_past_due_children BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Completed: has actual end date
    IF p_actual_end_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Past Due: key end date has passed OR has past due children
    IF p_has_past_due_children THEN
        RETURN 'past_due';
    END IF;

    IF p_key_end_date IS NOT NULL AND p_key_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- Active: key start <= today (and not past due)
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- On-Deck: key start within 10 days
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- Future: key start > 10 days OR no dates set
    RETURN 'future';
END;
$$;

-- Requirement-specific (uses due_date instead of end_date)
CREATE OR REPLACE FUNCTION compute_requirement_status(
    p_completed_date DATE,
    p_key_start_date DATE,
    p_key_due_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Completed: has completed date
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Past Due: key due date has passed
    IF p_key_due_date IS NOT NULL AND p_key_due_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- Active: key start <= today
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- On-Deck: key start within 10 days
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 5. KEY DATE CALCULATION FUNCTIONS (Bottom-up ripple)
-- ============================================================================

-- Calculate key dates for a Requirement
CREATE OR REPLACE FUNCTION calculate_requirement_key_dates(p_requirement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_req RECORD;
    v_key_start DATE;
    v_key_due DATE;
    v_computed TEXT;
BEGIN
    SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Key start: COALESCE(actual_start, expected_start)
    v_key_start := COALESCE(v_req.actual_start_date, v_req.expected_start_date);

    -- Key due: COALESCE(actual_due, expected_due)
    v_key_due := COALESCE(v_req.actual_due_date, v_req.expected_due_date);

    -- Compute status
    v_computed := compute_requirement_status(v_req.completed_date, v_key_start, v_key_due);

    -- Update the requirement
    UPDATE requirements
    SET key_due_date = v_key_due,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_requirement_id;
END;
$$;

-- Calculate key dates for a Pitch (ripple from requirements)
CREATE OR REPLACE FUNCTION calculate_pitch_key_dates(p_pitch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_pitch RECORD;
    v_min_child_start DATE;
    v_max_child_end DATE;
    v_key_start DATE;
    v_key_end DATE;
    v_computed TEXT;
    v_has_past_due BOOLEAN;
BEGIN
    SELECT * INTO v_pitch FROM pitches WHERE id = p_pitch_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child requirements aggregate dates
    SELECT
        MIN(COALESCE(key_due_date, expected_start_date)),
        MAX(key_due_date),
        EXISTS(SELECT 1 FROM requirements WHERE pitch_id = p_pitch_id AND deleted_at IS NULL AND computed_status = 'past_due')
    INTO v_min_child_start, v_max_child_end, v_has_past_due
    FROM requirements
    WHERE pitch_id = p_pitch_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_pitch.actual_start_date, v_min_child_start, v_pitch.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_pitch.actual_end_date, v_max_child_end, v_pitch.expected_end_date);

    -- Compute status
    v_computed := compute_entity_status(v_pitch.actual_end_date, v_key_start, v_key_end, v_has_past_due);

    -- Update the pitch
    UPDATE pitches
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_pitch_id;
END;
$$;

-- Calculate key dates for a Set (ripple from pitches and direct requirements)
CREATE OR REPLACE FUNCTION calculate_set_key_dates(p_set_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_set RECORD;
    v_min_child_start DATE;
    v_max_child_end DATE;
    v_key_start DATE;
    v_key_end DATE;
    v_computed TEXT;
    v_has_past_due BOOLEAN;
BEGIN
    SELECT * INTO v_set FROM sets WHERE id = p_set_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get aggregate from pitches
    SELECT
        MIN(key_start_date),
        MAX(key_end_date)
    INTO v_min_child_start, v_max_child_end
    FROM pitches
    WHERE set_id = p_set_id AND deleted_at IS NULL;

    -- Also consider direct requirements (no pitch)
    SELECT
        LEAST(v_min_child_start, MIN(COALESCE(key_due_date, expected_start_date))),
        GREATEST(v_max_child_end, MAX(key_due_date))
    INTO v_min_child_start, v_max_child_end
    FROM requirements
    WHERE set_id = p_set_id AND pitch_id IS NULL AND deleted_at IS NULL;

    -- Check for past due children
    v_has_past_due := EXISTS(
        SELECT 1 FROM pitches WHERE set_id = p_set_id AND deleted_at IS NULL AND computed_status = 'past_due'
    ) OR EXISTS(
        SELECT 1 FROM requirements WHERE set_id = p_set_id AND pitch_id IS NULL AND deleted_at IS NULL AND computed_status = 'past_due'
    );

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_set.actual_start_date, v_min_child_start, v_set.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_set.actual_end_date, v_max_child_end, v_set.expected_end_date);

    -- Compute status
    v_computed := compute_entity_status(v_set.actual_end_date, v_key_start, v_key_end, v_has_past_due);

    -- Update the set
    UPDATE sets
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_set_id;
END;
$$;

-- Calculate key dates for a Phase (ripple from sets)
CREATE OR REPLACE FUNCTION calculate_phase_key_dates(p_phase_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_phase RECORD;
    v_min_child_start DATE;
    v_max_child_end DATE;
    v_key_start DATE;
    v_key_end DATE;
    v_computed TEXT;
    v_has_past_due BOOLEAN;
BEGIN
    SELECT * INTO v_phase FROM project_phases WHERE id = p_phase_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child sets aggregate dates
    SELECT
        MIN(key_start_date),
        MAX(key_end_date),
        EXISTS(SELECT 1 FROM sets WHERE phase_id = p_phase_id AND deleted_at IS NULL AND computed_status = 'past_due')
    INTO v_min_child_start, v_max_child_end, v_has_past_due
    FROM sets
    WHERE phase_id = p_phase_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_phase.actual_start_date, v_min_child_start, v_phase.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_phase.actual_end_date, v_max_child_end, v_phase.expected_end_date);

    -- Compute status
    v_computed := compute_entity_status(v_phase.actual_end_date, v_key_start, v_key_end, v_has_past_due);

    -- Update the phase
    UPDATE project_phases
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_phase_id;
END;
$$;

-- Calculate key dates for a Project (ripple from phases)
CREATE OR REPLACE FUNCTION calculate_project_key_dates(p_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_project RECORD;
    v_min_child_start DATE;
    v_max_child_end DATE;
    v_key_start DATE;
    v_key_end DATE;
    v_computed TEXT;
    v_has_past_due BOOLEAN;
BEGIN
    SELECT * INTO v_project FROM projects WHERE id = p_project_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child phases aggregate dates
    SELECT
        MIN(key_start_date),
        MAX(key_end_date),
        EXISTS(SELECT 1 FROM project_phases WHERE project_id = p_project_id AND deleted_at IS NULL AND computed_status = 'past_due')
    INTO v_min_child_start, v_max_child_end, v_has_past_due
    FROM project_phases
    WHERE project_id = p_project_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_project.actual_start_date, v_min_child_start, v_project.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_project.actual_end_date, v_max_child_end, v_project.expected_end_date);

    -- Compute status
    v_computed := compute_entity_status(v_project.actual_end_date, v_key_start, v_key_end, v_has_past_due);

    -- Update the project
    UPDATE projects
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_project_id;
END;
$$;

-- ============================================================================
-- 6. TRIGGERS FOR DATE RIPPLING (Bottom-up cascade)
-- ============================================================================

-- Requirement trigger: recalculate self, then ripple to parent pitch/set
CREATE OR REPLACE FUNCTION trigger_requirement_date_ripple()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate this requirement's key dates
    PERFORM calculate_requirement_key_dates(NEW.id);

    -- Ripple to parent pitch (if any)
    IF NEW.pitch_id IS NOT NULL THEN
        PERFORM calculate_pitch_key_dates(NEW.pitch_id);
        -- Pitch will cascade up
    END IF;

    -- Ripple to parent set (if any)
    IF NEW.set_id IS NOT NULL THEN
        PERFORM calculate_set_key_dates(NEW.set_id);
        -- Get phase_id from set and ripple up
        PERFORM calculate_phase_key_dates(s.phase_id) FROM sets s WHERE s.id = NEW.set_id AND s.phase_id IS NOT NULL;
        -- Get project_id from set and ripple up
        PERFORM calculate_project_key_dates(s.project_id) FROM sets s WHERE s.id = NEW.set_id AND s.project_id IS NOT NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requirement_date_ripple_trigger ON requirements;
CREATE TRIGGER requirement_date_ripple_trigger
    AFTER INSERT OR UPDATE OF expected_start_date, expected_due_date, actual_start_date, actual_due_date, completed_date, deleted_at
    ON requirements
    FOR EACH ROW
    EXECUTE FUNCTION trigger_requirement_date_ripple();

-- Pitch trigger: recalculate self, then ripple to parent set
CREATE OR REPLACE FUNCTION trigger_pitch_date_ripple()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate this pitch's key dates
    PERFORM calculate_pitch_key_dates(NEW.id);

    -- Ripple to parent set
    IF NEW.set_id IS NOT NULL THEN
        PERFORM calculate_set_key_dates(NEW.set_id);
        -- Get phase_id from set and ripple up
        PERFORM calculate_phase_key_dates(s.phase_id) FROM sets s WHERE s.id = NEW.set_id AND s.phase_id IS NOT NULL;
        -- Get project_id from set and ripple up
        PERFORM calculate_project_key_dates(s.project_id) FROM sets s WHERE s.id = NEW.set_id AND s.project_id IS NOT NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pitch_date_ripple_trigger ON pitches;
CREATE TRIGGER pitch_date_ripple_trigger
    AFTER INSERT OR UPDATE OF expected_start_date, expected_end_date, actual_start_date, actual_end_date, deleted_at
    ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_pitch_date_ripple();

-- Set trigger: recalculate self, then ripple to parent phase/project
CREATE OR REPLACE FUNCTION trigger_set_date_ripple()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate this set's key dates
    PERFORM calculate_set_key_dates(NEW.id);

    -- Ripple to parent phase (if any)
    IF NEW.phase_id IS NOT NULL THEN
        PERFORM calculate_phase_key_dates(NEW.phase_id);
    END IF;

    -- Ripple to parent project (if any)
    IF NEW.project_id IS NOT NULL THEN
        PERFORM calculate_project_key_dates(NEW.project_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_date_ripple_trigger ON sets;
CREATE TRIGGER set_date_ripple_trigger
    AFTER INSERT OR UPDATE OF expected_start_date, expected_end_date, actual_start_date, actual_end_date, completion_date, deleted_at
    ON sets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_date_ripple();

-- Phase trigger: recalculate self, then ripple to parent project
CREATE OR REPLACE FUNCTION trigger_phase_date_ripple()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate this phase's key dates
    PERFORM calculate_phase_key_dates(NEW.id);

    -- Ripple to parent project
    IF NEW.project_id IS NOT NULL THEN
        PERFORM calculate_project_key_dates(NEW.project_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase_date_ripple_trigger ON project_phases;
CREATE TRIGGER phase_date_ripple_trigger
    AFTER INSERT OR UPDATE OF expected_start_date, expected_end_date, actual_start_date, actual_end_date, deleted_at
    ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION trigger_phase_date_ripple();

-- Project trigger: just recalculate self
CREATE OR REPLACE FUNCTION trigger_project_date_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate this project's key dates
    PERFORM calculate_project_key_dates(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_date_recalc_trigger ON projects;
CREATE TRIGGER project_date_recalc_trigger
    AFTER INSERT OR UPDATE OF expected_start_date, expected_end_date, actual_start_date, actual_end_date, deleted_at
    ON projects
    FOR EACH ROW
    EXECUTE FUNCTION trigger_project_date_recalc();

-- ============================================================================
-- 7. BACKFILL EXISTING DATA
-- ============================================================================

-- Function to backfill all key dates (run once after migration)
CREATE OR REPLACE FUNCTION backfill_all_key_dates()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_req RECORD;
    v_pitch RECORD;
    v_set RECORD;
    v_phase RECORD;
    v_project RECORD;
BEGIN
    -- Start from leaf nodes (requirements) and work up
    RAISE NOTICE 'Backfilling requirements...';
    FOR v_req IN SELECT id FROM requirements WHERE deleted_at IS NULL LOOP
        PERFORM calculate_requirement_key_dates(v_req.id);
    END LOOP;

    RAISE NOTICE 'Backfilling pitches...';
    FOR v_pitch IN SELECT id FROM pitches WHERE deleted_at IS NULL LOOP
        PERFORM calculate_pitch_key_dates(v_pitch.id);
    END LOOP;

    RAISE NOTICE 'Backfilling sets...';
    FOR v_set IN SELECT id FROM sets WHERE deleted_at IS NULL LOOP
        PERFORM calculate_set_key_dates(v_set.id);
    END LOOP;

    RAISE NOTICE 'Backfilling phases...';
    FOR v_phase IN SELECT id FROM project_phases WHERE deleted_at IS NULL LOOP
        PERFORM calculate_phase_key_dates(v_phase.id);
    END LOOP;

    RAISE NOTICE 'Backfilling projects...';
    FOR v_project IN SELECT id FROM projects WHERE deleted_at IS NULL LOOP
        PERFORM calculate_project_key_dates(v_project.id);
    END LOOP;

    RAISE NOTICE 'Backfill complete!';
END;
$$;

-- Run the backfill
SELECT backfill_all_key_dates();

-- ============================================================================
-- 8. UPDATED DASHBOARD VIEWS
-- ============================================================================

-- Drop and recreate my_work_items view with computed_status
DROP VIEW IF EXISTS my_work_items;
CREATE VIEW my_work_items AS
SELECT
    'set' AS item_type,
    s.id,
    s.tenant_id,
    s.name,
    s.description,
    COALESCE(s.computed_status, s.status) AS status,
    s.priority,
    s.key_start_date AS expected_start_date,
    s.key_end_date AS expected_due_date,
    s.completion_percentage,
    s.lead_id,
    s.secondary_lead_id,
    s.pm_id,
    NULL::uuid AS assigned_to_id,
    s.client_id,
    s.project_id,
    s.id AS set_id,
    NULL::uuid AS pitch_id,
    c.name AS client_name,
    p.name AS project_name,
    NULL AS set_name,
    NULL AS pitch_name,
    s.created_at
FROM sets s
LEFT JOIN clients c ON s.client_id = c.id
LEFT JOIN projects p ON s.project_id = p.id
WHERE s.deleted_at IS NULL
    AND s.is_template IS NOT TRUE

UNION ALL

SELECT
    'pitch' AS item_type,
    pi.id,
    pi.tenant_id,
    pi.name,
    pi.description,
    COALESCE(pi.computed_status, pi.status) AS status,
    pi.priority,
    pi.key_start_date AS expected_start_date,
    pi.key_end_date AS expected_due_date,
    pi.completion_percentage,
    pi.lead_id,
    pi.secondary_lead_id,
    NULL::uuid AS pm_id,
    NULL::uuid AS assigned_to_id,
    s.client_id,
    s.project_id,
    pi.set_id,
    pi.id AS pitch_id,
    c.name AS client_name,
    p.name AS project_name,
    s.name AS set_name,
    NULL AS pitch_name,
    pi.created_at
FROM pitches pi
JOIN sets s ON pi.set_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
LEFT JOIN projects p ON s.project_id = p.id
WHERE pi.deleted_at IS NULL
    AND pi.is_template IS NOT TRUE

UNION ALL

SELECT
    'requirement' AS item_type,
    r.id,
    r.tenant_id,
    r.title AS name,
    r.description,
    COALESCE(r.computed_status, r.status) AS status,
    r.priority,
    COALESCE(r.expected_start_date, r.expected_due_date) AS expected_start_date,
    COALESCE(r.key_due_date, r.expected_due_date) AS expected_due_date,
    CASE WHEN r.status = 'completed' THEN 100 ELSE 0 END AS completion_percentage,
    r.lead_id,
    r.secondary_lead_id,
    r.pm_id,
    r.assigned_to_id,
    r.client_id,
    s.project_id,
    r.set_id,
    r.pitch_id,
    c.name AS client_name,
    p.name AS project_name,
    s.name AS set_name,
    pi.name AS pitch_name,
    r.created_at
FROM requirements r
LEFT JOIN sets s ON r.set_id = s.id
LEFT JOIN pitches pi ON r.pitch_id = pi.id
LEFT JOIN clients c ON r.client_id = c.id
LEFT JOIN projects p ON s.project_id = p.id
WHERE r.deleted_at IS NULL;

-- Updated past due views using computed_status
DROP VIEW IF EXISTS my_past_due_sets;
CREATE VIEW my_past_due_sets AS
SELECT s.*
FROM sets s
WHERE s.deleted_at IS NULL
    AND s.computed_status = 'past_due';

DROP VIEW IF EXISTS my_past_due_pitches;
CREATE VIEW my_past_due_pitches AS
SELECT p.*
FROM pitches p
WHERE p.deleted_at IS NULL
    AND p.computed_status = 'past_due';

DROP VIEW IF EXISTS my_past_due_requirements;
CREATE VIEW my_past_due_requirements AS
SELECT r.*
FROM requirements r
WHERE r.deleted_at IS NULL
    AND r.computed_status = 'past_due';

-- ============================================================================
-- 9. UPDATED KPI FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS get_my_work_kpis(UUID);
CREATE OR REPLACE FUNCTION get_my_work_kpis(p_user_profile_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_tenant_id UUID;
BEGIN
    -- Get user's current tenant
    SELECT tenant_id INTO v_tenant_id
    FROM tenant_users
    WHERE user_id = (SELECT user_id FROM user_profiles WHERE id = p_user_profile_id)
    LIMIT 1;

    SELECT json_build_object(
        'sets', json_build_object(
            'active', (SELECT COUNT(*) FROM sets
                       WHERE tenant_id = v_tenant_id
                       AND deleted_at IS NULL
                       AND computed_status IN ('active', 'on_deck')
                       AND (lead_id = p_user_profile_id OR secondary_lead_id = p_user_profile_id OR pm_id = p_user_profile_id)),
            'past_due', (SELECT COUNT(*) FROM sets
                         WHERE tenant_id = v_tenant_id
                         AND deleted_at IS NULL
                         AND computed_status = 'past_due'
                         AND (lead_id = p_user_profile_id OR secondary_lead_id = p_user_profile_id OR pm_id = p_user_profile_id))
        ),
        'pitches', json_build_object(
            'active', (SELECT COUNT(*) FROM pitches
                       WHERE tenant_id = v_tenant_id
                       AND deleted_at IS NULL
                       AND computed_status IN ('active', 'on_deck')
                       AND (lead_id = p_user_profile_id OR secondary_lead_id = p_user_profile_id)),
            'past_due', (SELECT COUNT(*) FROM pitches
                         WHERE tenant_id = v_tenant_id
                         AND deleted_at IS NULL
                         AND computed_status = 'past_due'
                         AND (lead_id = p_user_profile_id OR secondary_lead_id = p_user_profile_id))
        ),
        'tasks', json_build_object(
            'active', (SELECT COUNT(*) FROM requirements
                       WHERE tenant_id = v_tenant_id
                       AND deleted_at IS NULL
                       AND is_task = true
                       AND computed_status IN ('active', 'on_deck')
                       AND (assigned_to_id = p_user_profile_id OR lead_id = p_user_profile_id)),
            'past_due', (SELECT COUNT(*) FROM requirements
                         WHERE tenant_id = v_tenant_id
                         AND deleted_at IS NULL
                         AND is_task = true
                         AND computed_status = 'past_due'
                         AND (assigned_to_id = p_user_profile_id OR lead_id = p_user_profile_id))
        ),
        'requirements', json_build_object(
            'active', (SELECT COUNT(*) FROM requirements
                       WHERE tenant_id = v_tenant_id
                       AND deleted_at IS NULL
                       AND computed_status IN ('active', 'on_deck')
                       AND (assigned_to_id = p_user_profile_id OR lead_id = p_user_profile_id)),
            'past_due', (SELECT COUNT(*) FROM requirements
                         WHERE tenant_id = v_tenant_id
                         AND deleted_at IS NULL
                         AND computed_status = 'past_due'
                         AND (assigned_to_id = p_user_profile_id OR lead_id = p_user_profile_id))
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 10. HELPER FUNCTION FOR DAILY STATUS REFRESH
-- ============================================================================

-- Since computed_status depends on CURRENT_DATE, we need a way to refresh
-- This can be run daily via cron or pg_cron
CREATE OR REPLACE FUNCTION refresh_all_computed_status()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Refresh from bottom up
    UPDATE requirements SET computed_status = compute_requirement_status(completed_date, COALESCE(actual_start_date, expected_start_date), key_due_date) WHERE deleted_at IS NULL;
    UPDATE pitches SET computed_status = compute_entity_status(actual_end_date, key_start_date, key_end_date, EXISTS(SELECT 1 FROM requirements WHERE pitch_id = pitches.id AND deleted_at IS NULL AND computed_status = 'past_due')) WHERE deleted_at IS NULL;
    UPDATE sets SET computed_status = compute_entity_status(actual_end_date, key_start_date, key_end_date, EXISTS(SELECT 1 FROM pitches WHERE set_id = sets.id AND deleted_at IS NULL AND computed_status = 'past_due') OR EXISTS(SELECT 1 FROM requirements WHERE set_id = sets.id AND pitch_id IS NULL AND deleted_at IS NULL AND computed_status = 'past_due')) WHERE deleted_at IS NULL;
    UPDATE project_phases SET computed_status = compute_entity_status(actual_end_date, key_start_date, key_end_date, EXISTS(SELECT 1 FROM sets WHERE phase_id = project_phases.id AND deleted_at IS NULL AND computed_status = 'past_due')) WHERE deleted_at IS NULL;
    UPDATE projects SET computed_status = compute_entity_status(actual_end_date, key_start_date, key_end_date, EXISTS(SELECT 1 FROM project_phases WHERE project_id = projects.id AND deleted_at IS NULL AND computed_status = 'past_due')) WHERE deleted_at IS NULL;
END;
$$;
