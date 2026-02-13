-- ============================================
-- POSTGREST SCHEMA CACHE REFRESH
-- ============================================
-- Purpose: Force PostgREST to reload its schema cache after database migrations
-- When to use: Run this in Supabase SQL Editor after any DDL changes (ALTER TABLE, CREATE TABLE, etc.)
-- Why needed: PostgREST caches table schemas for performance. New columns added via migrations
--             won't be recognized until the cache is refreshed.
-- ============================================

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- These queries verify that new columns are present in the database schema.
-- PostgREST should recognize them after the NOTIFY command above.

-- Verify clients table has expected columns from migration 002
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clients'
  AND column_name IN ('location', 'industry', 'overview', 'display_id', 'updated_by')
ORDER BY column_name;

-- Verify contacts table exists and has expected structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contacts'
  AND column_name IN ('id', 'tenant_id', 'client_id', 'display_id', 'first_name', 'last_name')
ORDER BY column_name;

-- Verify client_contacts table has all audit columns (migration 010)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'client_contacts'
ORDER BY ordinal_position;

-- Verify client status constraint allows all values (migration 010)
SELECT pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'clients'
  AND c.conname LIKE '%status%';

-- Verify sets table has client_id column (migration 009/010)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sets'
  AND column_name = 'client_id';

-- Expected output for client_contacts:
-- column_name   | data_type         | is_nullable
-- --------------|-------------------|-------------
-- id            | uuid             | NO
-- client_id     | uuid             | NO
-- contact_id    | uuid             | NO
-- is_primary    | boolean          | YES
-- created_at    | timestamp with tz| YES
-- created_by    | uuid             | YES
-- updated_at    | timestamp with tz| YES
-- updated_by    | uuid             | YES

-- Expected constraint definition:
-- CHECK ((status = ANY (ARRAY['onboarding', 'active', 'inactive', 'prospective'])))

-- If columns are missing from these results, the migration may not have run.
-- If columns appear here but PostgREST still returns errors, wait 5-10 seconds
-- for the schema cache to fully reload, then retry your API request.
