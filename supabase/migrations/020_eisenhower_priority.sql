-- Migration 020: Eisenhower Matrix Priority Logic
-- Adds 'priority' field to sets and requirements tables
-- Auto-calculates priority based on urgency + importance mapping

-- =============================================================================
-- 1. Add priority column to sets table
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sets' AND column_name = 'priority'
    ) THEN
        ALTER TABLE sets ADD COLUMN priority INTEGER;
        COMMENT ON COLUMN sets.priority IS 'Eisenhower Matrix priority (1-6): 1=Critical/High, 2=High/High, 3=High/Medium, 4=Medium/Medium, 5=Medium/Low, 6=Low/Low';
    END IF;
END $$;

-- =============================================================================
-- 2. Add priority column to requirements table
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'priority'
    ) THEN
        ALTER TABLE requirements ADD COLUMN priority INTEGER;
        COMMENT ON COLUMN requirements.priority IS 'Eisenhower Matrix priority (1-6): 1=Critical/High, 2=High/High, 3=High/Medium, 4=Medium/Medium, 5=Medium/Low, 6=Low/Low';
    END IF;
END $$;

-- =============================================================================
-- 3. Create function to calculate Eisenhower priority
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_eisenhower_priority(
    p_importance TEXT,
    p_urgency TEXT
) RETURNS INTEGER AS $$
BEGIN
    -- Eisenhower Matrix Priority Mapping:
    -- Priority 1: Critical importance + High urgency (Do First - Crisis)
    -- Priority 2: High importance + High urgency (Do First)
    -- Priority 3: High importance + Medium urgency (Schedule)
    -- Priority 4: Medium importance + Medium urgency (Schedule)
    -- Priority 5: Medium importance + Low urgency (Delegate)
    -- Priority 6: Low importance + Low urgency (Eliminate)

    -- Handle null values - default to medium
    IF p_importance IS NULL THEN p_importance := 'medium'; END IF;
    IF p_urgency IS NULL THEN p_urgency := 'medium'; END IF;

    -- Priority 1: Critical + High
    IF p_importance = 'critical' AND p_urgency = 'high' THEN
        RETURN 1;
    END IF;

    -- Priority 2: High + High
    IF p_importance = 'high' AND p_urgency = 'high' THEN
        RETURN 2;
    END IF;

    -- Priority 3: High + Medium, or Critical + Medium
    IF (p_importance = 'high' AND p_urgency = 'medium') OR
       (p_importance = 'critical' AND p_urgency = 'medium') THEN
        RETURN 3;
    END IF;

    -- Priority 4: Medium + Medium, High + Low, Critical + Low
    IF (p_importance = 'medium' AND p_urgency = 'medium') OR
       (p_importance = 'high' AND p_urgency = 'low') OR
       (p_importance = 'critical' AND p_urgency = 'low') THEN
        RETURN 4;
    END IF;

    -- Priority 5: Medium + Low, Medium + High, Low + Medium, Low + High
    IF (p_importance = 'medium' AND p_urgency = 'low') OR
       (p_importance = 'medium' AND p_urgency = 'high') OR
       (p_importance = 'low' AND p_urgency = 'medium') OR
       (p_importance = 'low' AND p_urgency = 'high') THEN
        RETURN 5;
    END IF;

    -- Priority 6: Low + Low (Eliminate quadrant)
    RETURN 6;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 4. Create trigger function for sets
-- =============================================================================

CREATE OR REPLACE FUNCTION set_priority_on_sets()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority := calculate_eisenhower_priority(NEW.importance, NEW.urgency);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. Create trigger function for requirements
-- =============================================================================

CREATE OR REPLACE FUNCTION set_priority_on_requirements()
RETURNS TRIGGER AS $$
BEGIN
    NEW.priority := calculate_eisenhower_priority(NEW.importance, NEW.urgency);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. Create triggers (drop existing first for idempotency)
-- =============================================================================

DROP TRIGGER IF EXISTS calculate_sets_priority_trigger ON sets;
CREATE TRIGGER calculate_sets_priority_trigger
    BEFORE INSERT OR UPDATE OF importance, urgency ON sets
    FOR EACH ROW
    EXECUTE FUNCTION set_priority_on_sets();

DROP TRIGGER IF EXISTS calculate_requirements_priority_trigger ON requirements;
CREATE TRIGGER calculate_requirements_priority_trigger
    BEFORE INSERT OR UPDATE OF importance, urgency ON requirements
    FOR EACH ROW
    EXECUTE FUNCTION set_priority_on_requirements();

-- =============================================================================
-- 7. Backfill existing records
-- =============================================================================

-- Backfill sets
UPDATE sets
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE priority IS NULL;

-- Backfill requirements
UPDATE requirements
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE priority IS NULL;

-- =============================================================================
-- 8. Add index for priority-based queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_sets_priority ON sets(priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requirements_priority ON requirements(priority) WHERE deleted_at IS NULL;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION calculate_eisenhower_priority(TEXT, TEXT) TO authenticated;
