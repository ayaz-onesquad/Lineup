-- ============================================
-- ADD CLIENT_ID TO SETS TABLE
-- Version: 009
-- Description: Sets can now be linked directly to clients (project_id becomes optional)
-- ============================================

-- ============================================
-- 1. ADD client_id COLUMN TO SETS
-- ============================================

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- Create index for client_id lookup
CREATE INDEX IF NOT EXISTS idx_sets_client_id ON sets(client_id);

-- ============================================
-- 2. POPULATE client_id FROM EXISTING PROJECTS
-- ============================================
-- For existing sets, derive client_id from their project's client

UPDATE sets s
SET client_id = p.client_id
FROM projects p
WHERE s.project_id = p.id
  AND s.client_id IS NULL;

-- ============================================
-- 3. MAKE project_id OPTIONAL
-- ============================================
-- Sets now require EITHER project_id OR client_id (not both required)

ALTER TABLE sets
  ALTER COLUMN project_id DROP NOT NULL;

-- Add check constraint to ensure at least client_id OR project_id is present
DO $$
BEGIN
  ALTER TABLE sets DROP CONSTRAINT IF EXISTS sets_requires_client_or_project;
  ALTER TABLE sets ADD CONSTRAINT sets_requires_client_or_project
    CHECK (client_id IS NOT NULL OR project_id IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 4. RLS POLICY UPDATE FOR sets
-- ============================================
-- Update RLS to allow access via client_id as well

DROP POLICY IF EXISTS "Users can view sets in their tenants" ON sets;
CREATE POLICY "Users can view sets in their tenants" ON sets
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- 5. REFRESH SCHEMA CACHE
-- ============================================
NOTIFY pgrst, 'reload schema';
