-- ============================================
-- FIX CLIENT_CONTACTS AUDIT COLUMNS AND FK ISSUES
-- Version: 008
-- Description: Add updated_by/updated_at to client_contacts, fix FK references
-- ============================================

-- ============================================
-- 1. ADD MISSING AUDIT COLUMNS TO CLIENT_CONTACTS
-- ============================================

ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_client_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_contacts_updated_at_trigger ON client_contacts;
CREATE TRIGGER client_contacts_updated_at_trigger
    BEFORE UPDATE ON client_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_client_contacts_updated_at();

-- ============================================
-- 2. FIX REQUIREMENTS ASSIGNED_TO_ID FK
-- ============================================
-- The assigned_to_id should reference user_profiles.id, not auth.users.id
-- This allows proper joins to get user names

-- First, drop the existing FK constraint if it exists
DO $$
BEGIN
    ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_assigned_to_id_fkey;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Create new FK to user_profiles (only if user_profiles table exists and has data)
-- Note: We need to be careful here - the column may already reference auth.users
-- and we need to change it to reference user_profiles

-- Check if the FK already points to user_profiles, if not, add it
DO $$
BEGIN
    -- Add FK constraint to user_profiles
    ALTER TABLE requirements
        ADD CONSTRAINT requirements_assigned_to_id_fkey
        FOREIGN KEY (assigned_to_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN foreign_key_violation THEN
        -- If there's existing data that violates the constraint, set those to null
        UPDATE requirements SET assigned_to_id = NULL
        WHERE assigned_to_id IS NOT NULL
        AND assigned_to_id NOT IN (SELECT id FROM user_profiles);
        -- Then try again
        ALTER TABLE requirements
            ADD CONSTRAINT requirements_assigned_to_id_fkey
            FOREIGN KEY (assigned_to_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
END $$;

-- Do the same for other user reference columns in requirements
DO $$
BEGIN
    ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_lead_id_fkey;
    ALTER TABLE requirements
        ADD CONSTRAINT requirements_lead_id_fkey
        FOREIGN KEY (lead_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_secondary_lead_id_fkey;
    ALTER TABLE requirements
        ADD CONSTRAINT requirements_secondary_lead_id_fkey
        FOREIGN KEY (secondary_lead_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_pm_id_fkey;
    ALTER TABLE requirements
        ADD CONSTRAINT requirements_pm_id_fkey
        FOREIGN KEY (pm_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_reviewer_id_fkey;
    ALTER TABLE requirements
        ADD CONSTRAINT requirements_reviewer_id_fkey
        FOREIGN KEY (reviewer_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- ============================================
-- 3. FIX SETS USER REFERENCE FKs
-- ============================================

DO $$
BEGIN
    ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_owner_id_fkey;
    ALTER TABLE sets
        ADD CONSTRAINT sets_owner_id_fkey
        FOREIGN KEY (owner_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_lead_id_fkey;
    ALTER TABLE sets
        ADD CONSTRAINT sets_lead_id_fkey
        FOREIGN KEY (lead_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_secondary_lead_id_fkey;
    ALTER TABLE sets
        ADD CONSTRAINT sets_secondary_lead_id_fkey
        FOREIGN KEY (secondary_lead_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_pm_id_fkey;
    ALTER TABLE sets
        ADD CONSTRAINT sets_pm_id_fkey
        FOREIGN KEY (pm_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- ============================================
-- 4. REMOVE is_primary FROM contacts TABLE
-- ============================================
-- is_primary now lives in client_contacts join table

ALTER TABLE contacts DROP COLUMN IF EXISTS is_primary;

-- ============================================
-- 5. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
