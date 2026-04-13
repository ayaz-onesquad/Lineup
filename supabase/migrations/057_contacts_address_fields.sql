-- Migration: Add address fields to contacts table
-- These mirror the address fields on the clients table for business correspondence

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- Add comments for documentation
COMMENT ON COLUMN contacts.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN contacts.address_line2 IS 'Street address line 2 (apt, suite, etc.)';
COMMENT ON COLUMN contacts.city IS 'City';
COMMENT ON COLUMN contacts.state IS 'State or province';
COMMENT ON COLUMN contacts.country IS 'Country';
COMMENT ON COLUMN contacts.postal_code IS 'Postal or ZIP code';
