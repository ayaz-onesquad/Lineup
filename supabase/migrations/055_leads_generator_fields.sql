-- Migration: Extend leads table for Lead Generator feature

-- 1. Add state column (Google Maps returns city and state separately)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS state TEXT;

-- 2. Add source_automation_name — stores the automation name that created
--    this lead, displayed as "Created By" in the lead detail view
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source_automation_name TEXT;

-- 3. Drop and recreate the source CHECK constraint to include 'lead_generator'
--    First find the constraint name (it may vary):
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name
  INTO constraint_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'leads'
    AND tc.constraint_type = 'CHECK'
    AND tc.constraint_name ILIKE '%source%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- Recreate with lead_generator included
-- Adjust the list to match whatever source values already existed
ALTER TABLE leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN (
    'referral',
    'website',
    'social_media',
    'cold_outreach',
    'event',
    'partner',
    'advertising',
    'lead_generator',
    'other'
  ));

-- 4. Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('state', 'source_automation_name', 'source')
ORDER BY column_name;
