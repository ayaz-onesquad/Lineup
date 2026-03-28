-- Migration: Extend documents table with full parent chain + external link + metadata
-- Keeps existing entity_type/entity_id for backward compatibility.
-- Adds explicit FK columns so the full hierarchy is always queryable.
--
-- Post-migration: Run supabase/refresh-schema-cache.sql in Supabase SQL Editor

-- 1. Explicit parent FK columns (all nullable — set only what applies)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS client_id      UUID REFERENCES clients(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id        UUID REFERENCES leads(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES projects(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_id       UUID REFERENCES project_phases(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS set_id         UUID REFERENCES sets(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pitch_id       UUID REFERENCES pitches(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES requirements(id)      ON DELETE SET NULL;

-- 2. External link — separate from file_url, both can coexist
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS external_link TEXT;   -- URL entered by user (not a stored file)

-- 3. Document type / category (may already exist as varchar, ensure it does)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE documents ADD COLUMN document_type VARCHAR(100);
  END IF;
END $$;
-- e.g. "Contract", "SOW", "Brief", "Reference", "Deliverable", "Other"

-- 4. Updated_by audit field (created_by already exists as uploaded_by)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 5. Visibility column for document access control
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE documents ADD COLUMN visibility VARCHAR(20) DEFAULT 'internal';
  END IF;
END $$;

-- 6. Version tracking columns
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- 7. Tags array column
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 8. Relax the NOT NULL on file_url since a document can be link-only
--    Only enforce that at least one of file_url OR external_link is present
--    (enforced at application layer, not DB constraint, for flexibility)
ALTER TABLE documents
  ALTER COLUMN file_url DROP NOT NULL;

-- 9. Update entity_type constraint to include all types
ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_entity_type_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_entity_type_check
  CHECK (entity_type IN (
    'client', 'lead', 'project', 'phase', 'set', 'pitch', 'requirement'
  ));

-- 10. Indexes on new FK columns
CREATE INDEX IF NOT EXISTS idx_documents_client_id
  ON documents(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_lead_id
  ON documents(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_project_id
  ON documents(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_phase_id
  ON documents(phase_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_set_id
  ON documents(set_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_pitch_id
  ON documents(pitch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_requirement_id
  ON documents(requirement_id) WHERE deleted_at IS NULL;

-- 11. Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;
