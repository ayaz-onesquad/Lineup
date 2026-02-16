-- Migration 030: Remove Pitches Approval Workflow
-- This migration removes all approval-related fields from the pitches table
-- as the approval workflow concept is fully deprecated.

-- Step 1: Drop the approval check constraint
ALTER TABLE pitches DROP CONSTRAINT IF EXISTS pitches_approval_check;

-- Step 2: Drop the index on is_approved
DROP INDEX IF EXISTS idx_pitches_is_approved;

-- Step 3: Drop the approval columns
ALTER TABLE pitches DROP COLUMN IF EXISTS is_approved;
ALTER TABLE pitches DROP COLUMN IF EXISTS approved_by_id;
ALTER TABLE pitches DROP COLUMN IF EXISTS approved_at;

-- Verify columns are removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pitches' AND column_name = 'is_approved'
  ) THEN
    RAISE EXCEPTION 'is_approved column still exists - migration failed';
  END IF;

  RAISE NOTICE 'Pitches approval workflow successfully removed';
END $$;
