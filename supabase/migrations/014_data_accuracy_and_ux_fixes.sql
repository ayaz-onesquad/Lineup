-- Migration 014: Data Accuracy & UX Refinement Fixes
-- Fixes 4 critical issues:
-- 1. Add role column to client_contacts for client-specific contact roles
-- 2. Drop due_date from sets table (not needed)
-- 3. Rename requirements date columns: expected_end_date -> expected_due_date, actual_end_date -> actual_due_date
-- 4. Add completed_date to requirements (distinct from completed_at timestamp)

-- ===========================================================
-- 1. Add role column to client_contacts table
-- ===========================================================
-- The role field should be client-specific (stored in join table)
-- not global (stored in contacts table)

-- Add role column to client_contacts
ALTER TABLE client_contacts
ADD COLUMN IF NOT EXISTS role TEXT
CHECK (role IN ('owner', 'executive', 'manager', 'coordinator', 'technical', 'billing', 'other'));

-- Migrate existing role data from contacts to client_contacts
-- This copies the global role to each client-contact relationship
UPDATE client_contacts cc
SET role = c.role
FROM contacts c
WHERE cc.contact_id = c.id
AND c.role IS NOT NULL
AND cc.role IS NULL;

-- Note: We keep the role column in contacts table for now (backwards compatibility)
-- It can be dropped in a future migration after UI is fully updated

-- ===========================================================
-- 2. Drop due_date from sets table
-- ===========================================================
-- Sets use expected_start_date and expected_end_date for scheduling
-- due_date is redundant

ALTER TABLE sets DROP COLUMN IF EXISTS due_date;

-- ===========================================================
-- 3. Rename requirements date columns for clarity
-- ===========================================================
-- expected_end_date -> expected_due_date (when task is expected to be due)
-- actual_end_date -> actual_due_date (when task was actually due/completed)
-- This provides clearer semantics for task tracking

-- Rename expected_end_date to expected_due_date
ALTER TABLE requirements
RENAME COLUMN expected_end_date TO expected_due_date;

-- Rename actual_end_date to actual_due_date
ALTER TABLE requirements
RENAME COLUMN actual_end_date TO actual_due_date;

-- Drop the old due_date column (redundant with expected_due_date)
ALTER TABLE requirements DROP COLUMN IF EXISTS due_date;

-- ===========================================================
-- 4. Add completed_date to requirements
-- ===========================================================
-- This is a DATE type (not TIMESTAMPTZ like completed_at)
-- completed_at: automatic timestamp when status changed to completed
-- completed_date: user-specified completion date for reporting

ALTER TABLE requirements
ADD COLUMN IF NOT EXISTS completed_date DATE;

-- ===========================================================
-- Summary of changes:
-- ===========================================================
-- client_contacts: Added 'role' column (client-specific contact role)
-- sets: Removed 'due_date' column
-- requirements: Renamed expected_end_date -> expected_due_date
-- requirements: Renamed actual_end_date -> actual_due_date
-- requirements: Removed 'due_date' column
-- requirements: Added 'completed_date' column
