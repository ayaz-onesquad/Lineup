-- Migration 046: Enhanced Computed Status Engine
-- Implements the 7-status system with "Past Due [Child]" variants
-- Status is now READ-ONLY calculated based on dates and child entity states

-- ============================================================================
-- 0. ENSURE REQUIRED COLUMNS EXIST (idempotent - in case 045 wasn't run)
-- ============================================================================

-- Key date columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_end_date DATE;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS key_end_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS key_end_date DATE;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS key_start_date DATE;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS key_end_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS key_due_date DATE;

-- Computed status columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS computed_status TEXT;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS computed_status TEXT;

-- ============================================================================
-- 1. BASE STATUS FUNCTIONS (from migration 045, needed if not run)
-- ============================================================================

-- Requirement-specific (uses due_date instead of end_date, no children)
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
-- 2. ENHANCED COMPUTED STATUS FUNCTIONS
-- Now returns specific "past_due_*" statuses based on which child level is past due
-- ============================================================================

-- For Projects: checks for past due phases, sets, pitches, requirements
CREATE OR REPLACE FUNCTION compute_project_status(
    p_actual_end_date DATE,
    p_key_start_date DATE,
    p_key_end_date DATE,
    p_project_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_has_past_due_phases BOOLEAN;
    v_has_past_due_sets BOOLEAN;
    v_has_past_due_pitches BOOLEAN;
    v_has_past_due_requirements BOOLEAN;
BEGIN
    -- Completed: has actual end date
    IF p_actual_end_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Check for past due children at each level
    SELECT EXISTS(
        SELECT 1 FROM project_phases
        WHERE project_id = p_project_id
        AND deleted_at IS NULL
        AND computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_phases;

    IF v_has_past_due_phases THEN
        -- Check if phases themselves are past_due or have past_due children
        SELECT EXISTS(
            SELECT 1 FROM project_phases
            WHERE project_id = p_project_id
            AND deleted_at IS NULL
            AND computed_status = 'past_due'
        ) INTO v_has_past_due_phases;

        IF v_has_past_due_phases THEN
            RETURN 'past_due_phases';
        END IF;
    END IF;

    -- Check for past due sets (via phases)
    SELECT EXISTS(
        SELECT 1 FROM sets s
        JOIN project_phases pp ON s.phase_id = pp.id
        WHERE pp.project_id = p_project_id
        AND s.deleted_at IS NULL
        AND s.computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_sets;

    IF v_has_past_due_sets THEN
        SELECT EXISTS(
            SELECT 1 FROM sets s
            JOIN project_phases pp ON s.phase_id = pp.id
            WHERE pp.project_id = p_project_id
            AND s.deleted_at IS NULL
            AND s.computed_status = 'past_due'
        ) INTO v_has_past_due_sets;

        IF v_has_past_due_sets THEN
            RETURN 'past_due_sets';
        END IF;
    END IF;

    -- Check for past due pitches
    SELECT EXISTS(
        SELECT 1 FROM pitches pi
        JOIN sets s ON pi.set_id = s.id
        JOIN project_phases pp ON s.phase_id = pp.id
        WHERE pp.project_id = p_project_id
        AND pi.deleted_at IS NULL
        AND pi.computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_pitches;

    IF v_has_past_due_pitches THEN
        SELECT EXISTS(
            SELECT 1 FROM pitches pi
            JOIN sets s ON pi.set_id = s.id
            JOIN project_phases pp ON s.phase_id = pp.id
            WHERE pp.project_id = p_project_id
            AND pi.deleted_at IS NULL
            AND pi.computed_status = 'past_due'
        ) INTO v_has_past_due_pitches;

        IF v_has_past_due_pitches THEN
            RETURN 'past_due_pitches';
        END IF;
    END IF;

    -- Check for past due requirements
    SELECT EXISTS(
        SELECT 1 FROM requirements r
        JOIN sets s ON r.set_id = s.id
        JOIN project_phases pp ON s.phase_id = pp.id
        WHERE pp.project_id = p_project_id
        AND r.deleted_at IS NULL
        AND r.computed_status = 'past_due'
    ) INTO v_has_past_due_requirements;

    IF v_has_past_due_requirements THEN
        RETURN 'past_due_requirements';
    END IF;

    -- Own past due: key end date has passed
    IF p_key_end_date IS NOT NULL AND p_key_end_date < CURRENT_DATE THEN
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

-- For Phases: checks for past due sets, pitches, requirements
CREATE OR REPLACE FUNCTION compute_phase_status(
    p_actual_end_date DATE,
    p_key_start_date DATE,
    p_key_end_date DATE,
    p_phase_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_has_past_due_sets BOOLEAN;
    v_has_past_due_pitches BOOLEAN;
    v_has_past_due_requirements BOOLEAN;
BEGIN
    -- Completed: has actual end date
    IF p_actual_end_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Check for past due sets
    SELECT EXISTS(
        SELECT 1 FROM sets
        WHERE phase_id = p_phase_id
        AND deleted_at IS NULL
        AND computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_sets;

    IF v_has_past_due_sets THEN
        SELECT EXISTS(
            SELECT 1 FROM sets
            WHERE phase_id = p_phase_id
            AND deleted_at IS NULL
            AND computed_status = 'past_due'
        ) INTO v_has_past_due_sets;

        IF v_has_past_due_sets THEN
            RETURN 'past_due_sets';
        END IF;
    END IF;

    -- Check for past due pitches
    SELECT EXISTS(
        SELECT 1 FROM pitches pi
        JOIN sets s ON pi.set_id = s.id
        WHERE s.phase_id = p_phase_id
        AND pi.deleted_at IS NULL
        AND pi.computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_pitches;

    IF v_has_past_due_pitches THEN
        SELECT EXISTS(
            SELECT 1 FROM pitches pi
            JOIN sets s ON pi.set_id = s.id
            WHERE s.phase_id = p_phase_id
            AND pi.deleted_at IS NULL
            AND pi.computed_status = 'past_due'
        ) INTO v_has_past_due_pitches;

        IF v_has_past_due_pitches THEN
            RETURN 'past_due_pitches';
        END IF;
    END IF;

    -- Check for past due requirements
    SELECT EXISTS(
        SELECT 1 FROM requirements r
        JOIN sets s ON r.set_id = s.id
        WHERE s.phase_id = p_phase_id
        AND r.deleted_at IS NULL
        AND r.computed_status = 'past_due'
    ) INTO v_has_past_due_requirements;

    IF v_has_past_due_requirements THEN
        RETURN 'past_due_requirements';
    END IF;

    -- Own past due
    IF p_key_end_date IS NOT NULL AND p_key_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    RETURN 'future';
END;
$$;

-- For Sets: checks for past due pitches, requirements
CREATE OR REPLACE FUNCTION compute_set_status(
    p_actual_end_date DATE,
    p_key_start_date DATE,
    p_key_end_date DATE,
    p_set_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_has_past_due_pitches BOOLEAN;
    v_has_past_due_requirements BOOLEAN;
BEGIN
    -- Completed: has actual end date
    IF p_actual_end_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Check for past due pitches
    SELECT EXISTS(
        SELECT 1 FROM pitches
        WHERE set_id = p_set_id
        AND deleted_at IS NULL
        AND computed_status LIKE 'past_due%'
    ) INTO v_has_past_due_pitches;

    IF v_has_past_due_pitches THEN
        SELECT EXISTS(
            SELECT 1 FROM pitches
            WHERE set_id = p_set_id
            AND deleted_at IS NULL
            AND computed_status = 'past_due'
        ) INTO v_has_past_due_pitches;

        IF v_has_past_due_pitches THEN
            RETURN 'past_due_pitches';
        END IF;
    END IF;

    -- Check for past due requirements (direct or via pitches)
    SELECT EXISTS(
        SELECT 1 FROM requirements
        WHERE set_id = p_set_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_requirements;

    IF v_has_past_due_requirements THEN
        RETURN 'past_due_requirements';
    END IF;

    -- Own past due
    IF p_key_end_date IS NOT NULL AND p_key_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    RETURN 'future';
END;
$$;

-- For Pitches: checks for past due requirements
CREATE OR REPLACE FUNCTION compute_pitch_status(
    p_actual_end_date DATE,
    p_key_start_date DATE,
    p_key_end_date DATE,
    p_pitch_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_has_past_due_requirements BOOLEAN;
BEGIN
    -- Completed: has actual end date
    IF p_actual_end_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Check for past due requirements
    SELECT EXISTS(
        SELECT 1 FROM requirements
        WHERE pitch_id = p_pitch_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_requirements;

    IF v_has_past_due_requirements THEN
        RETURN 'past_due_requirements';
    END IF;

    -- Own past due
    IF p_key_end_date IS NOT NULL AND p_key_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    RETURN 'future';
END;
$$;

-- ============================================================================
-- 3. UPDATE KEY DATE CALCULATION FUNCTIONS TO USE NEW STATUS FUNCTIONS
-- ============================================================================

-- Requirement: simple status (no children)
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

    -- Compute status using the requirement-specific function
    v_computed := compute_requirement_status(v_req.completed_date, v_key_start, v_key_due);

    -- Update the requirement
    UPDATE requirements
    SET key_due_date = v_key_due,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_requirement_id;
END;
$$;

-- Pitch: uses new compute_pitch_status
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
BEGIN
    SELECT * INTO v_pitch FROM pitches WHERE id = p_pitch_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child requirements aggregate dates
    SELECT
        MIN(COALESCE(key_due_date, expected_start_date)),
        MAX(key_due_date)
    INTO v_min_child_start, v_max_child_end
    FROM requirements
    WHERE pitch_id = p_pitch_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_pitch.actual_start_date, v_min_child_start, v_pitch.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_pitch.actual_end_date, v_max_child_end, v_pitch.expected_end_date);

    -- Compute status using the enhanced function
    v_computed := compute_pitch_status(v_pitch.actual_end_date, v_key_start, v_key_end, p_pitch_id);

    -- Update the pitch
    UPDATE pitches
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_pitch_id;
END;
$$;

-- Set: uses new compute_set_status
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

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_set.actual_start_date, v_min_child_start, v_set.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_set.actual_end_date, v_max_child_end, v_set.expected_end_date);

    -- Compute status using the enhanced function
    v_computed := compute_set_status(v_set.actual_end_date, v_key_start, v_key_end, p_set_id);

    -- Update the set
    UPDATE sets
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_set_id;
END;
$$;

-- Phase: uses new compute_phase_status
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
BEGIN
    SELECT * INTO v_phase FROM project_phases WHERE id = p_phase_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child sets aggregate dates
    SELECT
        MIN(key_start_date),
        MAX(key_end_date)
    INTO v_min_child_start, v_max_child_end
    FROM sets
    WHERE phase_id = p_phase_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_phase.actual_start_date, v_min_child_start, v_phase.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_phase.actual_end_date, v_max_child_end, v_phase.expected_end_date);

    -- Compute status using the enhanced function
    v_computed := compute_phase_status(v_phase.actual_end_date, v_key_start, v_key_end, p_phase_id);

    -- Update the phase
    UPDATE project_phases
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_phase_id;
END;
$$;

-- Project: uses new compute_project_status
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
BEGIN
    SELECT * INTO v_project FROM projects WHERE id = p_project_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get child phases aggregate dates
    SELECT
        MIN(key_start_date),
        MAX(key_end_date)
    INTO v_min_child_start, v_max_child_end
    FROM project_phases
    WHERE project_id = p_project_id AND deleted_at IS NULL;

    -- Key start: COALESCE(actual, min(child key start), expected)
    v_key_start := COALESCE(v_project.actual_start_date, v_min_child_start, v_project.expected_start_date);

    -- Key end: COALESCE(actual, max(child key end), expected)
    v_key_end := COALESCE(v_project.actual_end_date, v_max_child_end, v_project.expected_end_date);

    -- Compute status using the enhanced function
    v_computed := compute_project_status(v_project.actual_end_date, v_key_start, v_key_end, p_project_id);

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
-- 4. UPDATED DAILY REFRESH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_all_computed_status()
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
    -- Refresh from bottom up (requirements first, then parents)
    RAISE NOTICE 'Refreshing requirements...';
    FOR v_req IN SELECT id FROM requirements WHERE deleted_at IS NULL LOOP
        PERFORM calculate_requirement_key_dates(v_req.id);
    END LOOP;

    RAISE NOTICE 'Refreshing pitches...';
    FOR v_pitch IN SELECT id FROM pitches WHERE deleted_at IS NULL LOOP
        PERFORM calculate_pitch_key_dates(v_pitch.id);
    END LOOP;

    RAISE NOTICE 'Refreshing sets...';
    FOR v_set IN SELECT id FROM sets WHERE deleted_at IS NULL LOOP
        PERFORM calculate_set_key_dates(v_set.id);
    END LOOP;

    RAISE NOTICE 'Refreshing phases...';
    FOR v_phase IN SELECT id FROM project_phases WHERE deleted_at IS NULL LOOP
        PERFORM calculate_phase_key_dates(v_phase.id);
    END LOOP;

    RAISE NOTICE 'Refreshing projects...';
    FOR v_project IN SELECT id FROM projects WHERE deleted_at IS NULL LOOP
        PERFORM calculate_project_key_dates(v_project.id);
    END LOOP;

    RAISE NOTICE 'Refresh complete!';
END;
$$;

-- ============================================================================
-- 5. UPDATE VIEWS TO USE NEW STATUS VALUES
-- ============================================================================

-- Updated past due views to include all past_due variants
DROP VIEW IF EXISTS my_past_due_sets;
CREATE VIEW my_past_due_sets AS
SELECT s.*
FROM sets s
WHERE s.deleted_at IS NULL
    AND s.computed_status LIKE 'past_due%';

DROP VIEW IF EXISTS my_past_due_pitches;
CREATE VIEW my_past_due_pitches AS
SELECT p.*
FROM pitches p
WHERE p.deleted_at IS NULL
    AND p.computed_status LIKE 'past_due%';

DROP VIEW IF EXISTS my_past_due_requirements;
CREATE VIEW my_past_due_requirements AS
SELECT r.*
FROM requirements r
WHERE r.deleted_at IS NULL
    AND r.computed_status = 'past_due';

-- ============================================================================
-- 6. UPDATE KPI FUNCTION TO COUNT ALL PAST_DUE VARIANTS
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
                         AND computed_status LIKE 'past_due%'
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
                         AND computed_status LIKE 'past_due%'
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
-- 7. RUN BACKFILL TO APPLY NEW STATUS LOGIC
-- ============================================================================

SELECT refresh_all_computed_status();
