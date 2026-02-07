-- ============================================
-- ADD CLIENT RELATIONSHIP FIELDS
-- Version: 005
-- Description: Add relationship_manager_id and referral_source to clients table
-- ============================================

-- 1. Create referral_source ENUM type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_source') THEN
    CREATE TYPE referral_source AS ENUM (
      'referral',
      'website',
      'social_media',
      'advertising',
      'event',
      'partner',
      'cold_outreach',
      'other'
    );
  END IF;
END $$;

-- 2. Add new columns to clients table
DO $$
BEGIN
  -- Add relationship_manager_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'relationship_manager_id'
  ) THEN
    ALTER TABLE clients
    ADD COLUMN relationship_manager_id UUID REFERENCES user_profiles(id);
  END IF;

  -- Add referral_source column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'referral_source'
  ) THEN
    ALTER TABLE clients
    ADD COLUMN referral_source referral_source;
  END IF;
END $$;

-- 3. Create index on relationship_manager_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_relationship_manager
ON clients(relationship_manager_id)
WHERE relationship_manager_id IS NOT NULL;

-- 4. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
