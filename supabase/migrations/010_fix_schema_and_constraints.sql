-- ============================================
-- COMPREHENSIVE SCHEMA FIXES
-- Version: 010
-- Description: Fix client_contacts columns, status constraints, and refresh schema
-- ============================================

-- ============================================
-- 1. ENSURE client_contacts HAS ALL REQUIRED COLUMNS
-- ============================================
-- Migration 007 created the table with created_by
-- Migration 008 added updated_by and updated_at
-- This ensures both are present regardless of execution order

-- Add created_by if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_contacts' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE client_contacts ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add updated_by if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_contacts' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE client_contacts ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_contacts' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE client_contacts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Update trigger for updated_at (idempotent)
CREATE OR REPLACE FUNCTION update_client_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_contacts_updated_at_trigger ON client_contacts;
CREATE TRIGGER client_contacts_updated_at_trigger
    BEFORE UPDATE ON client_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_client_contacts_updated_at();

-- ============================================
-- 2. FIX CLIENT STATUS CHECK CONSTRAINT
-- ============================================
-- Ensure all valid statuses are allowed: onboarding, active, inactive, prospective

DO $$
BEGIN
  -- Drop ALL possible constraint names (from various migration attempts)
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check1;
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check2;
  ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_chk;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Create the correct constraint
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('onboarding', 'active', 'inactive', 'prospective'));

-- Ensure default is 'onboarding'
ALTER TABLE clients ALTER COLUMN status SET DEFAULT 'onboarding';

-- ============================================
-- 3. ENSURE SETS HAS client_id COLUMN AND CONSTRAINT
-- ============================================

-- Add client_id column if not exists (from migration 009)
ALTER TABLE sets ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- Create index for client_id lookup
CREATE INDEX IF NOT EXISTS idx_sets_client_id ON sets(client_id);

-- Ensure constraint exists: at least client_id OR project_id must be set
DO $$
BEGIN
  ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_requires_client_or_project;
  ALTER TABLE sets ADD CONSTRAINT sets_requires_client_or_project
    CHECK (client_id IS NOT NULL OR project_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 4. ENSURE get_user_highest_role FUNCTION EXISTS
-- ============================================
-- This function is used by useUserRole hook and bypasses RLS

CREATE OR REPLACE FUNCTION get_user_highest_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Check roles in priority order
  SELECT role INTO v_role
  FROM tenant_users
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY
    CASE role
      WHEN 'sys_admin' THEN 1
      WHEN 'org_admin' THEN 2
      WHEN 'org_user' THEN 3
      WHEN 'client_user' THEN 4
      ELSE 5
    END
  LIMIT 1;

  RETURN v_role;
END;
$$;

-- ============================================
-- 5. ENSURE USER PROFILE CREATION TRIGGER EXISTS
-- ============================================
-- This trigger creates a user_profile when a new auth user is created
-- Important for users created by admins

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 6. ENSURE user_profiles HAS UNIQUE CONSTRAINT ON user_id
-- ============================================

DO $$
BEGIN
  ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_key;
  ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;

-- ============================================
-- 7. FIX RLS POLICIES FOR client_contacts TABLE
-- ============================================
-- The client_contacts table needs proper RLS policies for INSERT/UPDATE/DELETE

-- Enable RLS if not already enabled
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can view client_contacts in their tenants" ON client_contacts;
DROP POLICY IF EXISTS "Users can insert client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can update client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can delete client_contacts" ON client_contacts;

-- SELECT: Users can view client_contacts for clients in their tenants
CREATE POLICY "Users can view client_contacts in their tenants" ON client_contacts
    FOR SELECT USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- INSERT: Users can insert client_contacts for clients in their tenants
CREATE POLICY "Users can insert client_contacts" ON client_contacts
    FOR INSERT WITH CHECK (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- UPDATE: Users can update client_contacts for clients in their tenants
CREATE POLICY "Users can update client_contacts" ON client_contacts
    FOR UPDATE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- DELETE: Users can delete client_contacts for clients in their tenants
CREATE POLICY "Users can delete client_contacts" ON client_contacts
    FOR DELETE USING (
        client_id IN (
            SELECT c.id FROM clients c
            WHERE c.tenant_id IN (
                SELECT tenant_id FROM tenant_users
                WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
            )
        )
    );

-- ============================================
-- 8. REFRESH POSTGREST SCHEMA CACHE
-- ============================================
-- CRITICAL: This notifies PostgREST to reload its schema cache

NOTIFY pgrst, 'reload schema';
