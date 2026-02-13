-- Migration 015: Add client_id to requirements and make set_id optional
-- This allows requirements to be created without a set initially

-- Step 1: Add client_id column to requirements (NOT NULL with backfill)
ALTER TABLE requirements ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Step 2: Backfill client_id from sets → projects → clients for existing requirements
UPDATE requirements r
SET client_id = (
  SELECT p.client_id
  FROM sets s
  JOIN projects p ON s.project_id = p.id
  WHERE s.id = r.set_id
)
WHERE r.client_id IS NULL AND r.set_id IS NOT NULL;

-- Step 3: Backfill from sets with direct client_id (sets without project)
UPDATE requirements r
SET client_id = (
  SELECT s.client_id
  FROM sets s
  WHERE s.id = r.set_id AND s.client_id IS NOT NULL
)
WHERE r.client_id IS NULL AND r.set_id IS NOT NULL;

-- Step 4: Make client_id NOT NULL after backfill
-- Only if all rows have client_id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM requirements WHERE client_id IS NULL) THEN
    ALTER TABLE requirements ALTER COLUMN client_id SET NOT NULL;
  END IF;
END $$;

-- Step 5: Make set_id nullable (allow requirements without sets)
ALTER TABLE requirements ALTER COLUMN set_id DROP NOT NULL;

-- Step 6: Add constraint - requirements must have either set_id OR client_id
-- Since client_id is now NOT NULL, this is implicitly satisfied
-- But add check for data integrity
ALTER TABLE requirements DROP CONSTRAINT IF EXISTS requirements_client_or_set_check;
ALTER TABLE requirements ADD CONSTRAINT requirements_client_or_set_check
  CHECK (client_id IS NOT NULL);

-- Step 7: Add index for client_id queries
CREATE INDEX IF NOT EXISTS idx_requirements_client_id ON requirements(client_id);

-- Step 8: Update RLS policies for requirements to include client_id access
DROP POLICY IF EXISTS "Users can view requirements in their tenants" ON requirements;
CREATE POLICY "Users can view requirements in their tenants" ON requirements
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert requirements" ON requirements;
CREATE POLICY "Users can insert requirements" ON requirements
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
        AND client_id IN (
            SELECT id FROM clients
            WHERE tenant_id IN (
                SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update requirements" ON requirements;
CREATE POLICY "Users can update requirements" ON requirements
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin', 'org_user')
        )
    );

DROP POLICY IF EXISTS "Users can delete requirements" ON requirements;
CREATE POLICY "Users can delete requirements" ON requirements
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid() AND role IN ('sys_admin', 'org_admin')
        )
    );

COMMENT ON COLUMN requirements.client_id IS 'Direct reference to client, required. Set_id is optional for unassigned requirements.';
COMMENT ON COLUMN requirements.set_id IS 'Optional reference to set. Requirements can exist without a set initially.';
