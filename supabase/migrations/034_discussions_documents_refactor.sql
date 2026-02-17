-- Migration 034: Discussions System Overhaul & Documents Link Support
-- 1. Polymorphic threaded discussions with global list/detail views
-- 2. Documents support for external links (URL type)

-- ============================================================================
-- 1. DISCUSSIONS SYSTEM OVERHAUL
-- ============================================================================

-- Add new columns to discussions table for polymorphic threaded design
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS topic_type VARCHAR(50);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS topic_id UUID;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'external'));
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS root_client_id UUID REFERENCES clients(id);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS participants UUID[] DEFAULT '{}';
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS display_id SERIAL;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS discussion_id_display VARCHAR(20);

-- Update entity_type CHECK to include 'pitch' and 'lead'
-- First drop existing constraint if it exists
DO $$
BEGIN
    ALTER TABLE discussions DROP CONSTRAINT IF EXISTS discussions_entity_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add updated constraint (or make entity_type nullable for global discussions)
ALTER TABLE discussions ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE discussions ALTER COLUMN entity_id DROP NOT NULL;

-- Add constraint for valid topic_types
ALTER TABLE discussions ADD CONSTRAINT discussions_topic_type_check
    CHECK (topic_type IS NULL OR topic_type IN ('client', 'project', 'phase', 'set', 'pitch', 'requirement', 'lead'));

-- Migrate existing data: copy entity_type/entity_id to topic_type/topic_id
UPDATE discussions
SET topic_type = entity_type,
    topic_id = entity_id,
    visibility = CASE WHEN is_internal THEN 'internal' ELSE 'external' END
WHERE topic_type IS NULL AND entity_type IS NOT NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_discussions_topic ON discussions(topic_type, topic_id);
CREATE INDEX IF NOT EXISTS idx_discussions_visibility ON discussions(visibility);
CREATE INDEX IF NOT EXISTS idx_discussions_root_client_id ON discussions(root_client_id);
CREATE INDEX IF NOT EXISTS idx_discussions_participants ON discussions USING GIN(participants);
CREATE INDEX IF NOT EXISTS idx_discussions_title ON discussions(title) WHERE title IS NOT NULL;

-- Display ID generation trigger
CREATE OR REPLACE FUNCTION generate_discussion_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.parent_discussion_id IS NULL THEN
        NEW.discussion_id_display := 'DIS-' || LPAD(NEW.display_id::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_discussion_display_id_trigger ON discussions;
CREATE TRIGGER generate_discussion_display_id_trigger
    BEFORE INSERT ON discussions
    FOR EACH ROW
    WHEN (NEW.discussion_id_display IS NULL)
    EXECUTE FUNCTION generate_discussion_display_id();

-- Function to get root_client_id from entity hierarchy
CREATE OR REPLACE FUNCTION get_root_client_id(p_topic_type TEXT, p_topic_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_client_id UUID;
BEGIN
    CASE p_topic_type
        WHEN 'client' THEN
            RETURN p_topic_id;
        WHEN 'project' THEN
            SELECT client_id INTO v_client_id FROM projects WHERE id = p_topic_id;
        WHEN 'phase' THEN
            SELECT p.client_id INTO v_client_id
            FROM project_phases pp
            JOIN projects p ON pp.project_id = p.id
            WHERE pp.id = p_topic_id;
        WHEN 'set' THEN
            SELECT client_id INTO v_client_id FROM sets WHERE id = p_topic_id;
        WHEN 'pitch' THEN
            SELECT s.client_id INTO v_client_id
            FROM pitches pi
            JOIN sets s ON pi.set_id = s.id
            WHERE pi.id = p_topic_id;
        WHEN 'requirement' THEN
            SELECT client_id INTO v_client_id FROM requirements WHERE id = p_topic_id;
        WHEN 'lead' THEN
            RETURN NULL; -- Leads don't have client associations
        ELSE
            RETURN NULL;
    END CASE;

    RETURN v_client_id;
END;
$$;

-- Trigger to auto-populate root_client_id on insert
CREATE OR REPLACE FUNCTION set_discussion_root_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.root_client_id IS NULL AND NEW.topic_type IS NOT NULL AND NEW.topic_id IS NOT NULL THEN
        NEW.root_client_id := get_root_client_id(NEW.topic_type, NEW.topic_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_discussion_root_client_id_trigger ON discussions;
CREATE TRIGGER set_discussion_root_client_id_trigger
    BEFORE INSERT ON discussions
    FOR EACH ROW
    EXECUTE FUNCTION set_discussion_root_client_id();

-- View for discussions with full context
CREATE OR REPLACE VIEW discussions_with_context AS
SELECT
    d.*,
    up.full_name as author_name,
    up.avatar_url as author_avatar,
    c.name as client_name,
    CASE d.topic_type
        WHEN 'client' THEN (SELECT name FROM clients WHERE id = d.topic_id)
        WHEN 'project' THEN (SELECT name FROM projects WHERE id = d.topic_id)
        WHEN 'phase' THEN (SELECT name FROM project_phases WHERE id = d.topic_id)
        WHEN 'set' THEN (SELECT name FROM sets WHERE id = d.topic_id)
        WHEN 'pitch' THEN (SELECT name FROM pitches WHERE id = d.topic_id)
        WHEN 'requirement' THEN (SELECT title FROM requirements WHERE id = d.topic_id)
        WHEN 'lead' THEN (SELECT lead_name FROM leads WHERE id = d.topic_id)
        ELSE NULL
    END as topic_name,
    (SELECT COUNT(*) FROM discussions r WHERE r.parent_discussion_id = d.id AND r.deleted_at IS NULL) as reply_count
FROM discussions d
LEFT JOIN user_profiles up ON d.author_id = up.user_id
LEFT JOIN clients c ON d.root_client_id = c.id
WHERE d.deleted_at IS NULL AND d.parent_discussion_id IS NULL;

GRANT SELECT ON discussions_with_context TO authenticated;

-- ============================================================================
-- 2. DOCUMENTS EXTERNAL LINK SUPPORT
-- ============================================================================

-- Add columns for link support
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(20) NOT NULL DEFAULT 'file'
    CHECK (document_type IN ('file', 'link'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS url TEXT;

-- Update has_file computed column to handle links
-- Drop and recreate since GENERATED columns can't be modified
ALTER TABLE documents DROP COLUMN IF EXISTS has_file;
ALTER TABLE documents ADD COLUMN has_file BOOLEAN GENERATED ALWAYS AS (file_url IS NOT NULL OR url IS NOT NULL) STORED;

-- Index for document type filtering
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

-- Constraint: Links must have URL, files must have file_url
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_validation;
ALTER TABLE documents ADD CONSTRAINT documents_type_validation CHECK (
    (document_type = 'file' AND file_url IS NOT NULL) OR
    (document_type = 'link' AND url IS NOT NULL)
);

-- Make file columns nullable for links
ALTER TABLE documents ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN file_type DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN file_size_bytes DROP NOT NULL;

-- Set defaults for link documents
ALTER TABLE documents ALTER COLUMN file_type SET DEFAULT '';
ALTER TABLE documents ALTER COLUMN file_size_bytes SET DEFAULT 0;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN discussions.title IS 'Thread title for top-level discussions (null for replies)';
COMMENT ON COLUMN discussions.topic_type IS 'The entity type this discussion is about (client, project, set, pitch, requirement, lead)';
COMMENT ON COLUMN discussions.topic_id IS 'The entity ID this discussion is about';
COMMENT ON COLUMN discussions.visibility IS 'internal = team only, external = visible to clients';
COMMENT ON COLUMN discussions.root_client_id IS 'Auto-populated client for easy filtering - derived from entity hierarchy';
COMMENT ON COLUMN discussions.participants IS 'Array of user IDs participating in this thread';
COMMENT ON COLUMN documents.document_type IS 'file = uploaded file, link = external URL';
COMMENT ON COLUMN documents.url IS 'External URL for link-type documents';
