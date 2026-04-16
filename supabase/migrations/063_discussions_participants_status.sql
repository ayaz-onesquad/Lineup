-- Migration 063: Discussions - Add subject, participant_ids, status, and concluded tracking
-- This enables:
-- 1. Subject/title for top-level discussions
-- 2. Explicit participant tracking (separate from mentions)
-- 3. Open/closed status for discussions
-- 4. Tracking who concluded a discussion and when

-- ============================================================================
-- 0. ENSURE ALL BASE COLUMNS EXIST (from migration 034, be defensive)
-- ============================================================================
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS topic_type VARCHAR(50);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS topic_id UUID;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'internal';
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS root_client_id UUID REFERENCES clients(id);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS participants UUID[] DEFAULT '{}';
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS parent_discussion_id UUID REFERENCES discussions(id);

-- ============================================================================
-- 1. ADD COMMENTS FOR CLARITY
-- ============================================================================
COMMENT ON COLUMN discussions.title IS 'Subject/title for top-level discussions (API maps this as "subject")';
COMMENT ON COLUMN discussions.participants IS 'Array of user IDs who are participants in this discussion thread';

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_discussions_participant_ids
  ON discussions USING GIN(participants) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discussions_topic ON discussions(topic_type, topic_id);
CREATE INDEX IF NOT EXISTS idx_discussions_root_client_id ON discussions(root_client_id);

-- ============================================================================
-- 2. ADD STATUS COLUMN (open/closed)
-- ============================================================================
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'closed'));

-- Index for status queries (filtered on tenant + status for My Open Discussions)
CREATE INDEX IF NOT EXISTS idx_discussions_status
  ON discussions(tenant_id, status) WHERE deleted_at IS NULL AND parent_discussion_id IS NULL;

-- ============================================================================
-- 3. ADD CONCLUDED TRACKING COLUMNS
-- ============================================================================
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS concluded_by UUID REFERENCES auth.users(id);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ;

-- Index for concluded queries
CREATE INDEX IF NOT EXISTS idx_discussions_concluded
  ON discussions(concluded_by) WHERE concluded_at IS NOT NULL;

-- ============================================================================
-- 4. UPDATE COMMENTS
-- ============================================================================
COMMENT ON COLUMN discussions.status IS 'Discussion status: open (active) or closed (concluded)';
COMMENT ON COLUMN discussions.concluded_by IS 'User ID who closed/concluded the discussion';
COMMENT ON COLUMN discussions.concluded_at IS 'Timestamp when the discussion was closed/concluded';

-- ============================================================================
-- 5. UPDATE discussions_with_context VIEW TO INCLUDE NEW COLUMNS
-- ============================================================================
DROP VIEW IF EXISTS discussions_with_context;

CREATE OR REPLACE VIEW discussions_with_context AS
SELECT
    d.*,
    up.full_name as author_name,
    up.avatar_url as author_avatar,
    c.name as client_name,
    cup.full_name as concluded_by_name,
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
LEFT JOIN user_profiles cup ON d.concluded_by = cup.user_id
LEFT JOIN clients c ON d.root_client_id = c.id
WHERE d.deleted_at IS NULL AND d.parent_discussion_id IS NULL;

GRANT SELECT ON discussions_with_context TO authenticated;
