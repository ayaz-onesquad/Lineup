-- ============================================
-- AUTO-INCREMENT ORDER_KEY ON INSERT
-- Migration: 056
-- Description: Ensures order_key is auto-assigned MAX+1 when not provided
--              for sets, requirements, project_phases, and pitches
-- ============================================
-- If order_key is not provided (NULL or 0), auto-assign MAX + 1 within the
-- parent scope to ensure new records append to the bottom of the list.
-- ============================================

-- ============================================
-- 1. ADD ORDER_KEY COLUMNS TO SETS AND REQUIREMENTS
-- ============================================

-- Sets: Add order_key column (scoped by phase_id or project_id)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS order_key NUMERIC(10,4) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_sets_order_key ON sets(order_key);

-- Requirements: Add order_key column (scoped by pitch_id or set_id)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS order_key NUMERIC(10,4) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_requirements_order_key ON requirements(order_key);

-- ============================================
-- 2. SETS: Auto-increment trigger (scoped by phase_id)
-- ============================================

CREATE OR REPLACE FUNCTION auto_set_order_key_sets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    max_order NUMERIC;
BEGIN
    -- Only auto-assign if order_key is NULL or 0 (not explicitly set)
    IF NEW.order_key IS NULL OR NEW.order_key = 0 THEN
        -- Scope by phase_id (Sets belong to Phases)
        SELECT COALESCE(MAX(order_key), 0) + 1
        INTO max_order
        FROM sets
        WHERE phase_id = NEW.phase_id
          AND tenant_id = NEW.tenant_id
          AND deleted_at IS NULL;

        NEW.order_key := max_order;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_auto_order_key_sets ON sets;
CREATE TRIGGER trg_auto_order_key_sets
    BEFORE INSERT ON sets
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_order_key_sets();

-- ============================================
-- 3. REQUIREMENTS: Auto-increment trigger (scoped by pitch_id or set_id)
-- ============================================

CREATE OR REPLACE FUNCTION auto_set_order_key_requirements()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    max_order NUMERIC;
BEGIN
    -- Only auto-assign if order_key is NULL or 0 (not explicitly set)
    IF NEW.order_key IS NULL OR NEW.order_key = 0 THEN
        -- Requirements can belong to a pitch OR directly to a set
        -- Scope by pitch_id if present, otherwise by set_id
        IF NEW.pitch_id IS NOT NULL THEN
            SELECT COALESCE(MAX(order_key), 0) + 1
            INTO max_order
            FROM requirements
            WHERE pitch_id = NEW.pitch_id
              AND tenant_id = NEW.tenant_id
              AND deleted_at IS NULL;
        ELSE
            SELECT COALESCE(MAX(order_key), 0) + 1
            INTO max_order
            FROM requirements
            WHERE set_id = NEW.set_id
              AND pitch_id IS NULL
              AND tenant_id = NEW.tenant_id
              AND deleted_at IS NULL;
        END IF;

        NEW.order_key := max_order;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_auto_order_key_requirements ON requirements;
CREATE TRIGGER trg_auto_order_key_requirements
    BEFORE INSERT ON requirements
    FOR EACH ROW
    EXECUTE FUNCTION auto_set_order_key_requirements();

-- ============================================
-- 4. PROJECT_PHASES: Update existing trigger for explicit NULL/0 check
-- ============================================
-- The existing calculate_phase_order_key() trigger already handles auto-assignment
-- but let's ensure the NULL/0 check is robust by wrapping the logic

CREATE OR REPLACE FUNCTION calculate_phase_order_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pred_order NUMERIC;
    v_succ_order NUMERIC;
BEGIN
    -- If order_key is explicitly set (not NULL/0), respect it unless using order_manual
    IF NEW.order_manual IS NOT NULL THEN
        NEW.order_key := NEW.order_manual;
        RETURN NEW;
    END IF;

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

    -- Auto-assign MAX+1 only if order_key is NULL or 0
    IF NEW.order_key IS NULL OR NEW.order_key = 0 THEN
        SELECT COALESCE(MAX(order_key), 0) + 1 INTO NEW.order_key
        FROM project_phases
        WHERE project_id = NEW.project_id
          AND tenant_id = NEW.tenant_id
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate trigger (already exists from migration 026)
DROP TRIGGER IF EXISTS calculate_phase_order_key_trigger ON project_phases;
CREATE TRIGGER calculate_phase_order_key_trigger
    BEFORE INSERT OR UPDATE OF order_manual, predecessor_phase_id, successor_phase_id ON project_phases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_phase_order_key();

-- ============================================
-- 5. PITCHES: Update existing trigger for explicit NULL/0 check
-- ============================================

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

    -- Auto-assign MAX+1 only if order_key is NULL or 0
    IF NEW.order_key IS NULL OR NEW.order_key = 0 THEN
        SELECT COALESCE(MAX(order_key), 0) + 1 INTO NEW.order_key
        FROM pitches
        WHERE set_id = NEW.set_id
          AND tenant_id = NEW.tenant_id
          AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate trigger (already exists from migration 026)
DROP TRIGGER IF EXISTS calculate_pitch_order_key_trigger ON pitches;
CREATE TRIGGER calculate_pitch_order_key_trigger
    BEFORE INSERT OR UPDATE OF order_manual, predecessor_pitch_id, successor_pitch_id ON pitches
    FOR EACH ROW
    EXECUTE FUNCTION calculate_pitch_order_key();

-- ============================================
-- 6. BACKFILL EXISTING RECORDS WITH SEQUENTIAL ORDER_KEYS
-- ============================================
-- Update existing records that have order_key = 0 with sequential values

-- Backfill sets (grouped by phase_id)
WITH ranked_sets AS (
    SELECT id, phase_id, tenant_id,
           ROW_NUMBER() OVER (PARTITION BY phase_id ORDER BY created_at, id) as rn
    FROM sets
    WHERE order_key = 0 AND deleted_at IS NULL
)
UPDATE sets s
SET order_key = rs.rn
FROM ranked_sets rs
WHERE s.id = rs.id;

-- Backfill requirements (grouped by pitch_id, then by set_id for orphans)
WITH ranked_reqs AS (
    SELECT id, pitch_id, set_id, tenant_id,
           ROW_NUMBER() OVER (
               PARTITION BY COALESCE(pitch_id::text, 'set_' || set_id::text)
               ORDER BY created_at, id
           ) as rn
    FROM requirements
    WHERE order_key = 0 AND deleted_at IS NULL
)
UPDATE requirements r
SET order_key = rr.rn
FROM ranked_reqs rr
WHERE r.id = rr.id;
