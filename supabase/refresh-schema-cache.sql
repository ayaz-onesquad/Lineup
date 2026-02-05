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
  AND column_name IN ('id', 'tenant_id', 'client_id', 'display_id', 'first_name', 'last_name', 'is_primary')
ORDER BY column_name;

-- Expected output for clients:
-- column_name   | data_type         | is_nullable
-- --------------|-------------------|-------------
-- display_id    | integer          | YES
-- industry      | text             | YES
-- location      | text             | YES
-- overview      | text             | YES
-- updated_by    | uuid             | YES

-- If columns are missing from these results, the migration may not have run.
-- If columns appear here but PostgREST still returns errors, wait 5-10 seconds
-- for the schema cache to fully reload, then retry your API request.
