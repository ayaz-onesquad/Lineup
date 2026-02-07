-- ============================================
-- FIX EMAIL CONSTRAINTS
-- Version: 006
-- Description: Ensure email columns are nullable in both clients and contacts tables
-- ============================================

-- ============================================
-- 1. DROP NOT NULL ON CONTACTS.EMAIL
-- ============================================

ALTER TABLE contacts ALTER COLUMN email DROP NOT NULL;

-- ============================================
-- 2. DROP NOT NULL ON CLIENTS.EMAIL (deprecated field)
-- ============================================

ALTER TABLE clients ALTER COLUMN email DROP NOT NULL;

-- ============================================
-- 3. SET DEFAULT VALUES TO NULL
-- ============================================

ALTER TABLE contacts ALTER COLUMN email SET DEFAULT NULL;
ALTER TABLE clients ALTER COLUMN email SET DEFAULT NULL;

-- ============================================
-- 4. VERIFICATION
-- ============================================
-- Run these queries to verify:
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'contacts' AND column_name = 'email';
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name = 'email';

-- ============================================
-- 5. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
