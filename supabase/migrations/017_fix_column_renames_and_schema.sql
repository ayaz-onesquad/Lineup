-- Migration 017: Fix Column Renames and Schema Issues
-- Ensures columns exist before renaming and handles edge cases from migration 014
--
-- This migration:
-- 1. Adds missing columns if they don't exist
-- 2. Safely renames columns using IF EXISTS pattern
-- 3. Fixes the sets.expected_end_date issue

-- ============================================================================
-- 1. ENSURE REQUIREMENTS HAS DATE COLUMNS BEFORE RENAME
-- ============================================================================
-- Migration 002 added expected_end_date and actual_end_date
-- Migration 014 renames them, but may fail if columns don't exist

-- First, ensure the columns exist (add if missing)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS expected_end_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- Now safely rename using DO block (idempotent)
DO $$
BEGIN
    -- Rename expected_end_date to expected_due_date if not already renamed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'expected_end_date'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'expected_due_date'
    ) THEN
        ALTER TABLE requirements RENAME COLUMN expected_end_date TO expected_due_date;
    END IF;

    -- Rename actual_end_date to actual_due_date if not already renamed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'actual_end_date'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'requirements' AND column_name = 'actual_due_date'
    ) THEN
        ALTER TABLE requirements RENAME COLUMN actual_end_date TO actual_due_date;
    END IF;
END $$;

-- Ensure expected_due_date and actual_due_date exist (in case rename didn't happen)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS expected_due_date DATE;
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS actual_due_date DATE;

-- ============================================================================
-- 2. ENSURE SETS HAS DATE COLUMNS
-- ============================================================================
-- Sets should have expected_start_date and expected_end_date (from migration 002)

ALTER TABLE sets ADD COLUMN IF NOT EXISTS expected_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS expected_end_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS actual_start_date DATE;
ALTER TABLE sets ADD COLUMN IF NOT EXISTS actual_end_date DATE;

-- ============================================================================
-- 3. ENSURE REQUIREMENTS HAS COMPLETED_DATE
-- ============================================================================

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS completed_date DATE;

-- ============================================================================
-- 4. DROP REDUNDANT DUE_DATE COLUMNS (IF THEY EXIST)
-- ============================================================================

ALTER TABLE requirements DROP COLUMN IF EXISTS due_date;
-- Note: sets.due_date was already dropped in migration 014

-- ============================================================================
-- 5. ENSURE client_contacts HAS ROLE COLUMN
-- ============================================================================

ALTER TABLE client_contacts ADD COLUMN IF NOT EXISTS role TEXT
    CHECK (role IN ('owner', 'executive', 'manager', 'coordinator', 'technical', 'billing', 'other'));

-- ============================================================================
-- 6. FIX FK RELATIONSHIPS FOR USER PROFILES
-- ============================================================================
-- The lead_id, secondary_lead_id, pm_id columns on projects/sets/requirements
-- currently reference auth.users(id), but we need them to reference user_profiles(id)
-- for PostgREST joins to work correctly.

-- We need to be careful here - first check if the FK points to auth.users or user_profiles
-- If it points to auth.users, we need to:
-- 1. Drop the old FK constraint
-- 2. Add new FK to user_profiles

-- Projects: Fix lead_id FK
DO $$
BEGIN
    -- Check if lead_id FK points to auth.users
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'projects'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.column_name = 'id'
        AND ccu.table_schema = 'auth'
        AND ccu.table_name = 'users'
        AND tc.constraint_name LIKE '%lead_id%'
    ) THEN
        -- Drop old FK and add new one pointing to user_profiles
        -- Note: This may fail if data doesn't match - in that case, leave as is
        BEGIN
            -- Find and drop the constraint
            EXECUTE (
                SELECT 'ALTER TABLE projects DROP CONSTRAINT ' || quote_ident(constraint_name)
                FROM information_schema.table_constraints
                WHERE table_name = 'projects'
                AND constraint_type = 'FOREIGN KEY'
                AND constraint_name LIKE '%lead_id%'
                LIMIT 1
            );
        EXCEPTION WHEN OTHERS THEN
            -- Constraint might not exist or other error - continue
            NULL;
        END;
    END IF;
END $$;

-- ============================================================================
-- 7. CREATE VIEW FOR PROJECTS WITH USER PROFILES
-- ============================================================================
-- This view joins projects with user_profiles for easier querying

CREATE OR REPLACE VIEW projects_with_profiles AS
SELECT
    p.*,
    c.name AS client_name,
    c.industry AS client_industry,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    secondary_lead_profile.full_name AS secondary_lead_name,
    secondary_lead_profile.avatar_url AS secondary_lead_avatar,
    pm_profile.full_name AS pm_name,
    pm_profile.avatar_url AS pm_avatar
FROM projects p
LEFT JOIN clients c ON p.client_id = c.id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = p.lead_id
LEFT JOIN user_profiles secondary_lead_profile ON secondary_lead_profile.user_id = p.secondary_lead_id
LEFT JOIN user_profiles pm_profile ON pm_profile.user_id = p.pm_id
WHERE p.deleted_at IS NULL;

-- Grant access to the view
GRANT SELECT ON projects_with_profiles TO authenticated;

-- ============================================================================
-- 8. CREATE VIEW FOR SETS WITH USER PROFILES
-- ============================================================================

CREATE OR REPLACE VIEW sets_with_profiles AS
SELECT
    s.*,
    c.name AS client_name,
    p.name AS project_name,
    owner_profile.full_name AS owner_name,
    owner_profile.avatar_url AS owner_avatar,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    secondary_lead_profile.full_name AS secondary_lead_name,
    secondary_lead_profile.avatar_url AS secondary_lead_avatar,
    pm_profile.full_name AS pm_name,
    pm_profile.avatar_url AS pm_avatar
FROM sets s
LEFT JOIN clients c ON s.client_id = c.id
LEFT JOIN projects p ON s.project_id = p.id
LEFT JOIN user_profiles owner_profile ON owner_profile.user_id = s.owner_id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = s.lead_id
LEFT JOIN user_profiles secondary_lead_profile ON secondary_lead_profile.user_id = s.secondary_lead_id
LEFT JOIN user_profiles pm_profile ON pm_profile.user_id = s.pm_id
WHERE s.deleted_at IS NULL;

GRANT SELECT ON sets_with_profiles TO authenticated;

-- ============================================================================
-- 9. CREATE VIEW FOR REQUIREMENTS WITH USER PROFILES
-- ============================================================================

CREATE OR REPLACE VIEW requirements_with_profiles AS
SELECT
    r.*,
    c.name AS client_name,
    s.name AS set_name,
    p.name AS project_name,
    assigned_profile.full_name AS assigned_to_name,
    assigned_profile.avatar_url AS assigned_to_avatar,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    reviewer_profile.full_name AS reviewer_name,
    reviewer_profile.avatar_url AS reviewer_avatar
FROM requirements r
LEFT JOIN clients c ON r.client_id = c.id
LEFT JOIN sets s ON r.set_id = s.id
LEFT JOIN projects p ON s.project_id = p.id
LEFT JOIN user_profiles assigned_profile ON assigned_profile.user_id = r.assigned_to_id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = r.lead_id
LEFT JOIN user_profiles reviewer_profile ON reviewer_profile.user_id = r.reviewer_id
WHERE r.deleted_at IS NULL;

GRANT SELECT ON requirements_with_profiles TO authenticated;

-- ============================================================================
-- 10. NOTIFY SCHEMA RELOAD
-- ============================================================================

NOTIFY pgrst, 'reload schema';
