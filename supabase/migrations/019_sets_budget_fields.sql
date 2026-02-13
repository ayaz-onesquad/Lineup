-- Migration: Add budget fields to sets table
-- Phase 3 - SET-02: Sets have Budget Days and Budget Hours fields

-- Add budget_days column (INTEGER for whole days)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS budget_days INTEGER;

-- Add budget_hours column (DECIMAL for fractional hours, e.g., 2.5 hours)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS budget_hours DECIMAL(6,2);

-- Add comments for documentation
COMMENT ON COLUMN sets.budget_days IS 'Budgeted number of days for this set';
COMMENT ON COLUMN sets.budget_hours IS 'Budgeted number of hours for this set';

-- Verify columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sets' AND column_name IN ('budget_days', 'budget_hours');
