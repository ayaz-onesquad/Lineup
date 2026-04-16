-- Migration 064: Fix discussions table RLS to allow UPDATE for tenant members
-- Root cause: No UPDATE policy existed, blocking participants updates in production
-- Supabase RLS returns success with rowsAffected: 0 when policy denies, silently failing

-- ============================================================================
-- STEP 1: Ensure RLS is enabled on discussions table
-- ============================================================================
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Drop any existing policies to avoid conflicts
-- ============================================================================
DROP POLICY IF EXISTS "discussions_update" ON discussions;
DROP POLICY IF EXISTS "discussions_update_policy" ON discussions;
DROP POLICY IF EXISTS "authors_can_update_discussions" ON discussions;
DROP POLICY IF EXISTS "tenant_members_can_update_discussions" ON discussions;
DROP POLICY IF EXISTS "discussions_update_by_tenant_member" ON discussions;

DROP POLICY IF EXISTS "discussions_select" ON discussions;
DROP POLICY IF EXISTS "discussions_select_policy" ON discussions;
DROP POLICY IF EXISTS "tenant_members_can_select_discussions" ON discussions;
DROP POLICY IF EXISTS "discussions_select_by_tenant_member" ON discussions;

DROP POLICY IF EXISTS "discussions_insert" ON discussions;
DROP POLICY IF EXISTS "discussions_insert_policy" ON discussions;
DROP POLICY IF EXISTS "tenant_members_can_insert_discussions" ON discussions;
DROP POLICY IF EXISTS "discussions_insert_by_tenant_member" ON discussions;

DROP POLICY IF EXISTS "discussions_delete" ON discussions;
DROP POLICY IF EXISTS "discussions_delete_policy" ON discussions;
DROP POLICY IF EXISTS "discussions_delete_by_author_or_admin" ON discussions;

-- ============================================================================
-- STEP 3: Create SELECT policy
-- Allow any active tenant member to view discussions in their tenant
-- ============================================================================
CREATE POLICY "discussions_select_by_tenant_member"
ON discussions
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
  OR public.is_sys_admin()
);

-- ============================================================================
-- STEP 4: Create INSERT policy
-- Allow any active tenant member to create discussions in their tenant
-- ============================================================================
CREATE POLICY "discussions_insert_by_tenant_member"
ON discussions
FOR INSERT
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
);

-- ============================================================================
-- STEP 5: Create UPDATE policy (THE MISSING POLICY)
-- Allow any active tenant member to update discussions in their tenant.
-- This covers:
--   - Author updating their own content
--   - Any participant adding/removing themselves
--   - OrgAdmin managing any discussion in their tenant
-- ============================================================================
CREATE POLICY "discussions_update_by_tenant_member"
ON discussions
FOR UPDATE
USING (
  -- User must be an active member of the same tenant as the discussion
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
)
WITH CHECK (
  -- Same tenant check on the new values being written
  tenant_id IN (
    SELECT tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
);

-- ============================================================================
-- STEP 6: Create DELETE policy
-- Only author, OrgAdmin, or SysAdmin can delete discussions
-- ============================================================================
CREATE POLICY "discussions_delete_by_author_or_admin"
ON discussions
FOR DELETE
USING (
  author_id = auth.uid()
  OR public.is_org_admin()
  OR public.is_sys_admin()
);

-- ============================================================================
-- STEP 7: Create indexes for efficient RLS and query performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_discussions_tenant_id
  ON discussions(tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_discussions_author_id
  ON discussions(author_id)
  WHERE deleted_at IS NULL;

-- GIN index for participants array (needed for .contains() queries)
DROP INDEX IF EXISTS idx_discussions_participant_ids;
DROP INDEX IF EXISTS idx_discussions_participants;
CREATE INDEX IF NOT EXISTS idx_discussions_participants_gin
  ON discussions USING GIN(participants)
  WHERE deleted_at IS NULL;

-- Composite index for "My Open Discussions" queries
DROP INDEX IF EXISTS idx_discussions_status;
CREATE INDEX IF NOT EXISTS idx_discussions_tenant_status
  ON discussions(tenant_id, status)
  WHERE deleted_at IS NULL AND parent_discussion_id IS NULL;

-- ============================================================================
-- VERIFICATION QUERY - Run this after applying to confirm policies exist
-- ============================================================================
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'discussions'
-- ORDER BY cmd, policyname;

-- Expected output:
-- discussions_delete_by_author_or_admin | DELETE
-- discussions_insert_by_tenant_member   | INSERT
-- discussions_select_by_tenant_member   | SELECT
-- discussions_update_by_tenant_member   | UPDATE
