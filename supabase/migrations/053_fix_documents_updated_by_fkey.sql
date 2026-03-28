-- Migration: Fix documents.updated_by FK to reference auth.users instead of user_profiles
-- All other user-audit FKs in this codebase (uploaded_by, created_by, author_id)
-- reference auth.users(id). updated_by must match this pattern.

-- Drop the incorrect FK constraint
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_updated_by_fkey;

-- Re-add pointing to auth.users (same target as uploaded_by)
ALTER TABLE documents
  ADD CONSTRAINT documents_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Verify constraint now references auth.users
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'documents'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name IN ('updated_by', 'uploaded_by');
