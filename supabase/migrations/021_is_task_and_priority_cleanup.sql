-- Migration 021: Add is_task field and clean up priority_score
-- 1. Add is_task boolean to requirements for task indexing
-- 2. Drop deprecated priority_score columns (replaced by priority from migration 020)

-- =============================================================================
-- 1. Add is_task column to requirements table
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'is_task'
    ) THEN
        ALTER TABLE requirements ADD COLUMN is_task BOOLEAN DEFAULT false;
        COMMENT ON COLUMN requirements.is_task IS 'When true, this requirement appears in the Global Tasks view for assigned user';
    END IF;
END $$;

-- Create index for task queries (frequently filtered by is_task + assigned_to_id)
CREATE INDEX IF NOT EXISTS idx_requirements_is_task ON requirements(is_task, assigned_to_id)
    WHERE is_task = true AND deleted_at IS NULL;

-- =============================================================================
-- 2. Drop priority_score columns (now replaced by priority from migration 020)
-- =============================================================================

-- Drop from sets table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sets' AND column_name = 'priority_score'
    ) THEN
        ALTER TABLE sets DROP COLUMN priority_score;
    END IF;
END $$;

-- Drop from requirements table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'priority_score'
    ) THEN
        ALTER TABLE requirements DROP COLUMN priority_score;
    END IF;
END $$;

-- =============================================================================
-- 3. Ensure priority column exists and has correct constraints
-- =============================================================================

-- Add CHECK constraint to ensure priority is 1-6
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'sets_priority_check'
    ) THEN
        ALTER TABLE sets ADD CONSTRAINT sets_priority_check CHECK (priority >= 1 AND priority <= 6);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'requirements_priority_check'
    ) THEN
        ALTER TABLE requirements ADD CONSTRAINT requirements_priority_check CHECK (priority >= 1 AND priority <= 6);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 4. Update priority for any records where it's still NULL
-- =============================================================================

UPDATE sets
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE priority IS NULL;

UPDATE requirements
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE priority IS NULL;

-- =============================================================================
-- 5. Create view for Global Tasks (requirements marked as tasks)
-- =============================================================================

CREATE OR REPLACE VIEW global_tasks AS
SELECT
    r.id,
    r.tenant_id,
    r.client_id,
    r.set_id,
    r.display_id,
    r.title,
    r.description,
    r.status,
    r.priority,
    r.urgency,
    r.importance,
    r.assigned_to_id,
    r.expected_due_date,
    r.completed_date,
    r.created_at,
    r.updated_at,
    c.name as client_name,
    s.name as set_name,
    p.full_name as assigned_to_name
FROM requirements r
LEFT JOIN clients c ON r.client_id = c.id
LEFT JOIN sets s ON r.set_id = s.id
LEFT JOIN user_profiles p ON r.assigned_to_id = p.user_id
WHERE r.is_task = true
  AND r.deleted_at IS NULL
  AND r.status != 'completed'
  AND r.status != 'cancelled';

COMMENT ON VIEW global_tasks IS 'Active tasks across all clients for quick access';
