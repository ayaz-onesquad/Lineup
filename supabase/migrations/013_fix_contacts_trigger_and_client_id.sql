-- ============================================
-- FIX CONTACTS TRIGGER AND SET CLIENT_ID PERSISTENCE
-- Version: 013
-- Description:
--   1. Drop ensure_single_primary_contact_trigger from contacts table
--      (trigger references is_primary which was removed in migration 008)
--   2. Ensure client_id can be updated on sets table
-- ============================================

-- ============================================
-- 1. DROP OBSOLETE TRIGGER ON CONTACTS TABLE
-- ============================================
-- This trigger was created in migration 002 and references NEW.is_primary
-- which no longer exists (removed in migration 008). This causes the error:
-- "record 'new' has no field 'is_primary'"

DROP TRIGGER IF EXISTS ensure_single_primary_contact_trigger ON contacts;
DROP FUNCTION IF EXISTS ensure_single_primary_contact();

-- Also drop any related index that might reference is_primary on contacts
DROP INDEX IF EXISTS idx_contacts_is_primary;

-- ============================================
-- 2. VERIFY client_contacts TRIGGER IS WORKING
-- ============================================
-- The ensure_single_primary_client_contact_trigger should be on client_contacts
-- (created in migration 007) - verify it exists

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'ensure_single_primary_client_contact_trigger'
    ) THEN
        -- Recreate the trigger if it doesn't exist
        CREATE OR REPLACE FUNCTION ensure_single_primary_client_contact()
        RETURNS TRIGGER AS $func$
        BEGIN
            IF NEW.is_primary = TRUE THEN
                UPDATE client_contacts
                SET is_primary = FALSE
                WHERE client_id = NEW.client_id
                AND id != NEW.id
                AND is_primary = TRUE;
            END IF;
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;

        CREATE TRIGGER ensure_single_primary_client_contact_trigger
            BEFORE INSERT OR UPDATE ON client_contacts
            FOR EACH ROW
            EXECUTE FUNCTION ensure_single_primary_client_contact();
    END IF;
END $$;

-- ============================================
-- 3. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
