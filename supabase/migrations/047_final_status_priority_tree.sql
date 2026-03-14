-- Migration 047: Final Status Logic & Completion Tracking
-- CRITICAL: Fix Status Priority Tree (Calculated Top-Down - DO NOT REORDER)
--
-- Priority 1: IF completed_date IS NOT NULL → 'Completed'
-- Priority 2: ELSE IF actual_end_date < TODAY → 'Past Due' (fallback to expected_end_date if actual is null)
-- Priority 3: ELSE IF has child past due → 'Past Due [Child Type]'
-- Priority 4: ELSE IF key_start_date <= TODAY → 'Active'
-- Priority 5: ELSE IF key_start_date <= (TODAY + 10 days) → 'On-Deck'
-- Priority 6: ELSE → 'Future'

-- ============================================================================
-- 1. ADD COMPLETION TRACKING FIELDS
-- ============================================================================

-- Projects: Add completed_date and completed_by
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES user_profiles(id);

-- Phases: Add completed_date and completed_by
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE project_phases ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES user_profiles(id);

-- Sets: completed_date exists, add completed_by
ALTER TABLE sets ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES user_profiles(id);

-- Pitches: Add completed_date and completed_by
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE pitches ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES user_profiles(id);

-- ============================================================================
-- 2. REQUIREMENT STATUS (Simple - no children, uses due_date)
-- ============================================================================

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
    -- PRIORITY 1: Completed
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- PRIORITY 2: Past Due (own due date has passed)
    IF p_key_due_date IS NOT NULL AND p_key_due_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- PRIORITY 4: Active (key start <= today)
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- PRIORITY 5: On-Deck (key start within 10 days)
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- PRIORITY 6: Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 3. PITCH STATUS (Has child requirements)
-- CRITICAL: Priority 2 (own past due) comes BEFORE Priority 3 (child past due)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_pitch_status(
    p_completed_date DATE,
    p_actual_end_date DATE,
    p_expected_end_date DATE,
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
    v_effective_end_date DATE;
BEGIN
    -- PRIORITY 1: Completed (has completed_date)
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Calculate effective end date for own past due check
    v_effective_end_date := COALESCE(p_actual_end_date, p_expected_end_date);

    -- PRIORITY 2: Own Past Due (actual_end_date < TODAY, fallback to expected_end_date)
    IF v_effective_end_date IS NOT NULL AND v_effective_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- PRIORITY 3: Child Past Due (check requirements)
    SELECT EXISTS(
        SELECT 1 FROM requirements
        WHERE pitch_id = p_pitch_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_requirements;

    IF v_has_past_due_requirements THEN
        RETURN 'past_due_requirements';
    END IF;

    -- PRIORITY 4: Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- PRIORITY 5: On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- PRIORITY 6: Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 4. SET STATUS (Has child pitches and requirements)
-- CRITICAL: Priority 2 (own past due) comes BEFORE Priority 3 (child past due)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_set_status(
    p_completed_date DATE,
    p_actual_end_date DATE,
    p_expected_end_date DATE,
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
    v_effective_end_date DATE;
BEGIN
    -- PRIORITY 1: Completed (has completed_date)
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Calculate effective end date for own past due check
    v_effective_end_date := COALESCE(p_actual_end_date, p_expected_end_date);

    -- PRIORITY 2: Own Past Due (actual_end_date < TODAY, fallback to expected_end_date)
    IF v_effective_end_date IS NOT NULL AND v_effective_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- PRIORITY 3: Child Past Due - Check in order: Pitches first (past_due only), then Requirements

    -- Check for pitches with their own past_due status (not inherited)
    SELECT EXISTS(
        SELECT 1 FROM pitches
        WHERE set_id = p_set_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_pitches;

    IF v_has_past_due_pitches THEN
        RETURN 'past_due_pitches';
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

    -- PRIORITY 4: Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- PRIORITY 5: On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- PRIORITY 6: Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 5. PHASE STATUS (Has child sets, pitches, requirements)
-- CRITICAL: Priority 2 (own past due) comes BEFORE Priority 3 (child past due)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_phase_status(
    p_completed_date DATE,
    p_actual_end_date DATE,
    p_expected_end_date DATE,
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
    v_effective_end_date DATE;
BEGIN
    -- PRIORITY 1: Completed (has completed_date)
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Calculate effective end date for own past due check
    v_effective_end_date := COALESCE(p_actual_end_date, p_expected_end_date);

    -- PRIORITY 2: Own Past Due (actual_end_date < TODAY, fallback to expected_end_date)
    IF v_effective_end_date IS NOT NULL AND v_effective_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- PRIORITY 3: Child Past Due - Check in order: Sets, then Pitches, then Requirements

    -- Check for sets with their own past_due status
    SELECT EXISTS(
        SELECT 1 FROM sets
        WHERE phase_id = p_phase_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_sets;

    IF v_has_past_due_sets THEN
        RETURN 'past_due_sets';
    END IF;

    -- Check for pitches with past_due status (via sets)
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

    -- Check for past due requirements (via sets)
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

    -- PRIORITY 4: Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- PRIORITY 5: On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- PRIORITY 6: Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 6. PROJECT STATUS (Has child phases, sets, pitches, requirements)
-- CRITICAL: Priority 2 (own past due) comes BEFORE Priority 3 (child past due)
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_project_status(
    p_completed_date DATE,
    p_actual_end_date DATE,
    p_expected_end_date DATE,
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
    v_effective_end_date DATE;
BEGIN
    -- PRIORITY 1: Completed (has completed_date)
    IF p_completed_date IS NOT NULL THEN
        RETURN 'completed';
    END IF;

    -- Calculate effective end date for own past due check
    v_effective_end_date := COALESCE(p_actual_end_date, p_expected_end_date);

    -- PRIORITY 2: Own Past Due (actual_end_date < TODAY, fallback to expected_end_date)
    IF v_effective_end_date IS NOT NULL AND v_effective_end_date < CURRENT_DATE THEN
        RETURN 'past_due';
    END IF;

    -- PRIORITY 3: Child Past Due - Check in order: Phases, Sets, Pitches, Requirements

    -- Check for phases with their own past_due status
    SELECT EXISTS(
        SELECT 1 FROM project_phases
        WHERE project_id = p_project_id
        AND deleted_at IS NULL
        AND computed_status = 'past_due'
    ) INTO v_has_past_due_phases;

    IF v_has_past_due_phases THEN
        RETURN 'past_due_phases';
    END IF;

    -- Check for sets with past_due status (via phases)
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

    -- Check for pitches with past_due status
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

    -- PRIORITY 4: Active
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= CURRENT_DATE THEN
        RETURN 'active';
    END IF;

    -- PRIORITY 5: On-Deck
    IF p_key_start_date IS NOT NULL AND p_key_start_date <= (CURRENT_DATE + INTERVAL '10 days') THEN
        RETURN 'on_deck';
    END IF;

    -- PRIORITY 6: Future
    RETURN 'future';
END;
$$;

-- ============================================================================
-- 7. UPDATE KEY DATE CALCULATION FUNCTIONS TO USE NEW STATUS FUNCTIONS
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

-- Pitch: uses new 6-parameter compute_pitch_status
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

    -- Compute status using the new 6-parameter function
    v_computed := compute_pitch_status(
        v_pitch.completed_date,
        v_pitch.actual_end_date,
        v_pitch.expected_end_date,
        v_key_start,
        v_key_end,
        p_pitch_id
    );

    -- Update the pitch
    UPDATE pitches
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_pitch_id;
END;
$$;

-- Set: uses new 6-parameter compute_set_status
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

    -- Compute status using the new 6-parameter function
    v_computed := compute_set_status(
        v_set.completion_date::DATE,  -- Sets use completion_date (cast from timestamptz)
        v_set.actual_end_date,
        v_set.expected_end_date,
        v_key_start,
        v_key_end,
        p_set_id
    );

    -- Update the set
    UPDATE sets
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_set_id;
END;
$$;

-- Phase: uses new 6-parameter compute_phase_status
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

    -- Compute status using the new 6-parameter function
    v_computed := compute_phase_status(
        v_phase.completed_date,
        v_phase.actual_end_date,
        v_phase.expected_end_date,
        v_key_start,
        v_key_end,
        p_phase_id
    );

    -- Update the phase
    UPDATE project_phases
    SET key_start_date = v_key_start,
        key_end_date = v_key_end,
        computed_status = v_computed,
        updated_at = NOW()
    WHERE id = p_phase_id;
END;
$$;

-- Project: uses new 6-parameter compute_project_status
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

    -- Compute status using the new 6-parameter function
    v_computed := compute_project_status(
        v_project.completed_date,
        v_project.actual_end_date,
        v_project.expected_end_date,
        v_key_start,
        v_key_end,
        p_project_id
    );

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
-- 8. AUTO-FILL completed_by TRIGGER
-- ============================================================================

-- Trigger function to auto-fill completed_by when completed_date is set
CREATE OR REPLACE FUNCTION auto_fill_completed_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_profile_id UUID;
BEGIN
    -- Only proceed if completed_date changed
    IF (TG_OP = 'UPDATE' AND OLD.completed_date IS DISTINCT FROM NEW.completed_date)
       OR (TG_OP = 'INSERT' AND NEW.completed_date IS NOT NULL) THEN

        -- If completed_date is being set, auto-fill completed_by
        IF NEW.completed_date IS NOT NULL AND NEW.completed_by IS NULL THEN
            -- Get current user's profile ID
            SELECT id INTO v_user_profile_id
            FROM user_profiles
            WHERE user_id = auth.uid()
            LIMIT 1;

            NEW.completed_by := v_user_profile_id;
        END IF;

        -- If completed_date is being cleared, clear completed_by too
        IF NEW.completed_date IS NULL THEN
            NEW.completed_by := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Separate trigger function for sets (uses completion_date instead of completed_date)
CREATE OR REPLACE FUNCTION auto_fill_completed_by_for_sets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_profile_id UUID;
BEGIN
    -- Only proceed if completion_date changed
    IF (TG_OP = 'UPDATE' AND OLD.completion_date IS DISTINCT FROM NEW.completion_date)
       OR (TG_OP = 'INSERT' AND NEW.completion_date IS NOT NULL) THEN

        -- If completion_date is being set, auto-fill completed_by
        IF NEW.completion_date IS NOT NULL AND NEW.completed_by IS NULL THEN
            -- Get current user's profile ID
            SELECT id INTO v_user_profile_id
            FROM user_profiles
            WHERE user_id = auth.uid()
            LIMIT 1;

            NEW.completed_by := v_user_profile_id;
        END IF;

        -- If completion_date is being cleared, clear completed_by too
        IF NEW.completion_date IS NULL THEN
            NEW.completed_by := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Create triggers for each entity

DROP TRIGGER IF EXISTS auto_fill_completed_by_projects ON projects;
CREATE TRIGGER auto_fill_completed_by_projects
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_completed_by();

DROP TRIGGER IF EXISTS auto_fill_completed_by_phases ON project_phases;
CREATE TRIGGER auto_fill_completed_by_phases
    BEFORE INSERT OR UPDATE ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_completed_by();

DROP TRIGGER IF EXISTS auto_fill_completed_by_sets ON sets;
CREATE TRIGGER auto_fill_completed_by_sets
    BEFORE INSERT OR UPDATE ON sets
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_completed_by_for_sets();

DROP TRIGGER IF EXISTS auto_fill_completed_by_pitches ON pitches;
CREATE TRIGGER auto_fill_completed_by_pitches
    BEFORE INSERT OR UPDATE ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION auto_fill_completed_by();

-- ============================================================================
-- 9. REFRESH ALL STATUS (Bottom-up)
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
-- 10. RUN BACKFILL TO APPLY NEW STATUS LOGIC
-- ============================================================================

SELECT refresh_all_computed_status();
