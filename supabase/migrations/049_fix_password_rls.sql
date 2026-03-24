-- ============================================
-- MIGRATION: Fix Password Manager RLS
-- Version: 049
-- Description: Fix RLS policies to use proper tenant membership check
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "passwords_select_org_admin" ON passwords;
DROP POLICY IF EXISTS "passwords_insert_org_admin" ON passwords;
DROP POLICY IF EXISTS "passwords_update_org_admin" ON passwords;
DROP POLICY IF EXISTS "passwords_delete_org_admin" ON passwords;

-- Only org_admin of this tenant can SELECT
CREATE POLICY "passwords_select_org_admin" ON passwords
  FOR SELECT USING (
    is_org_admin_of_tenant(tenant_id)
    AND deleted_at IS NULL
  );

-- Only org_admin can INSERT - checks that user is org_admin of the tenant being inserted
CREATE POLICY "passwords_insert_org_admin" ON passwords
  FOR INSERT WITH CHECK (
    is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can UPDATE
CREATE POLICY "passwords_update_org_admin" ON passwords
  FOR UPDATE USING (
    is_org_admin_of_tenant(tenant_id)
  );

-- Only org_admin can DELETE (soft delete via deleted_at)
CREATE POLICY "passwords_delete_org_admin" ON passwords
  FOR DELETE USING (
    is_org_admin_of_tenant(tenant_id)
  );

-- Verify policies exist
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'passwords';
