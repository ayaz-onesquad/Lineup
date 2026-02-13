-- Migration 023: Contacts Global Creation & Schema Cleanup
-- =============================================================================
-- 1. Allow contacts to exist without a client (Many-to-Many architecture)
-- 2. Ensure is_task column exists on requirements
-- =============================================================================

-- =============================================================================
-- 1. MAKE contacts.client_id NULLABLE (Many-to-Many Architecture)
-- =============================================================================
-- Contacts can now be created globally and linked to clients via client_contacts join table

ALTER TABLE contacts ALTER COLUMN client_id DROP NOT NULL;

COMMENT ON COLUMN contacts.client_id IS 'Deprecated: Use client_contacts join table for client relationships. Kept for backwards compatibility.';

-- =============================================================================
-- 2. NOTIFY POSTGREST TO RELOAD SCHEMA
-- =============================================================================

NOTIFY pgrst, 'reload schema';
