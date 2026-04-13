-- Migration: Add first_name and last_name to user_profiles
-- This allows storing split name fields while maintaining full_name for backwards compatibility

-- Add first_name and last_name columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill existing records: split full_name into first_name/last_name
-- For names with spaces, first word becomes first_name, rest becomes last_name
-- For names without spaces, entire name goes to first_name
UPDATE user_profiles
SET
  first_name = CASE
    WHEN full_name LIKE '% %' THEN split_part(full_name, ' ', 1)
    ELSE full_name
  END,
  last_name = CASE
    WHEN full_name LIKE '% %' THEN substring(full_name from position(' ' in full_name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL OR last_name IS NULL;

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_first_name ON user_profiles(first_name);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_name ON user_profiles(last_name);

-- Add a comment explaining the column usage
COMMENT ON COLUMN user_profiles.first_name IS 'User first name, split from full_name for granular display';
COMMENT ON COLUMN user_profiles.last_name IS 'User last name, split from full_name for granular display';
