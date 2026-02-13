-- Migration 022: Fix View Dependencies and Drop priority_score
-- =============================================================================
-- This migration properly handles the dependency between views and columns:
-- 1. Drops views that depend on priority_score
-- 2. Drops the priority_score columns
-- 3. Recreates the views WITHOUT priority_score
-- 4. Notifies PostgREST to reload schema
-- =============================================================================

-- =============================================================================
-- 1. DROP DEPENDENT VIEWS FIRST
-- =============================================================================

DROP VIEW IF EXISTS sets_with_profiles CASCADE;
DROP VIEW IF EXISTS requirements_with_profiles CASCADE;
DROP VIEW IF EXISTS projects_with_profiles CASCADE;
DROP VIEW IF EXISTS global_tasks CASCADE;

-- =============================================================================
-- 2. ADD is_task COLUMN IF NOT EXISTS (from migration 021)
-- =============================================================================

ALTER TABLE requirements ADD COLUMN IF NOT EXISTS is_task BOOLEAN DEFAULT false;
COMMENT ON COLUMN requirements.is_task IS 'When true, this requirement appears in the Global Tasks view for assigned user';

-- Create index for task queries (frequently filtered by is_task + assigned_to_id)
CREATE INDEX IF NOT EXISTS idx_requirements_is_task ON requirements(is_task, assigned_to_id)
    WHERE is_task = true AND deleted_at IS NULL;

-- =============================================================================
-- 3. DROP priority_score COLUMNS (NOW SAFE)
-- =============================================================================

-- Drop from sets table
ALTER TABLE sets DROP COLUMN IF EXISTS priority_score;

-- Drop from requirements table
ALTER TABLE requirements DROP COLUMN IF EXISTS priority_score;

-- =============================================================================
-- 4. RECREATE VIEWS WITHOUT priority_score
-- =============================================================================

-- Sets with profiles view
-- Note: Only includes columns that actually exist on the sets table
CREATE OR REPLACE VIEW sets_with_profiles AS
SELECT
    s.id,
    s.tenant_id,
    s.client_id,
    s.project_id,
    s.phase_id,
    s.display_id,
    s.name,
    s.description,
    s.set_order,
    s.status,
    s.priority,
    s.urgency,
    s.importance,
    s.completion_percentage,
    s.budget_days,
    s.budget_hours,
    s.expected_start_date,
    s.expected_end_date,
    s.actual_start_date,
    s.actual_end_date,
    s.completion_date,
    s.show_in_client_portal,
    s.owner_id,
    s.lead_id,
    s.secondary_lead_id,
    s.pm_id,
    s.created_at,
    s.created_by,
    s.updated_at,
    s.updated_by,
    s.deleted_at,
    c.name AS client_name,
    p.name AS project_name,
    owner_profile.full_name AS owner_name,
    owner_profile.avatar_url AS owner_avatar,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    secondary_lead_profile.full_name AS secondary_lead_name,
    secondary_lead_profile.avatar_url AS secondary_lead_avatar,
    pm_profile.full_name AS pm_name,
    pm_profile.avatar_url AS pm_avatar
FROM sets s
LEFT JOIN clients c ON s.client_id = c.id
LEFT JOIN projects p ON s.project_id = p.id
LEFT JOIN user_profiles owner_profile ON owner_profile.user_id = s.owner_id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = s.lead_id
LEFT JOIN user_profiles secondary_lead_profile ON secondary_lead_profile.user_id = s.secondary_lead_id
LEFT JOIN user_profiles pm_profile ON pm_profile.user_id = s.pm_id
WHERE s.deleted_at IS NULL;

GRANT SELECT ON sets_with_profiles TO authenticated;

-- Projects with profiles view
-- Note: Only includes columns that actually exist on the projects table
CREATE OR REPLACE VIEW projects_with_profiles AS
SELECT
    p.id,
    p.tenant_id,
    p.client_id,
    p.display_id,
    p.name,
    p.description,
    p.project_code,
    p.status,
    p.health,
    p.completion_percentage,
    p.expected_start_date,
    p.expected_end_date,
    p.actual_start_date,
    p.actual_end_date,
    p.completion_date,
    p.show_in_client_portal,
    p.lead_id,
    p.secondary_lead_id,
    p.pm_id,
    p.created_at,
    p.created_by,
    p.updated_at,
    p.updated_by,
    p.deleted_at,
    c.name AS client_name,
    c.industry AS client_industry,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    secondary_lead_profile.full_name AS secondary_lead_name,
    secondary_lead_profile.avatar_url AS secondary_lead_avatar,
    pm_profile.full_name AS pm_name,
    pm_profile.avatar_url AS pm_avatar
FROM projects p
LEFT JOIN clients c ON p.client_id = c.id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = p.lead_id
LEFT JOIN user_profiles secondary_lead_profile ON secondary_lead_profile.user_id = p.secondary_lead_id
LEFT JOIN user_profiles pm_profile ON pm_profile.user_id = p.pm_id
WHERE p.deleted_at IS NULL;

GRANT SELECT ON projects_with_profiles TO authenticated;

-- Requirements with profiles view
-- Note: Only includes columns that actually exist on the requirements table
CREATE OR REPLACE VIEW requirements_with_profiles AS
SELECT
    r.id,
    r.tenant_id,
    r.client_id,
    r.set_id,
    r.display_id,
    r.title,
    r.description,
    r.requirement_order,
    r.status,
    r.requirement_type,
    r.is_task,
    r.priority,
    r.urgency,
    r.importance,
    r.requires_document,
    r.requires_review,
    r.review_status,
    r.reviewed_at,
    r.assigned_to_id,
    r.lead_id,
    r.secondary_lead_id,
    r.pm_id,
    r.reviewer_id,
    r.expected_start_date,
    r.expected_due_date,
    r.actual_start_date,
    r.actual_due_date,
    r.completed_date,
    r.completed_at,
    r.estimated_hours,
    r.actual_hours,
    r.show_in_client_portal,
    r.created_at,
    r.created_by,
    r.updated_at,
    r.updated_by,
    r.deleted_at,
    c.name AS client_name,
    s.name AS set_name,
    proj.name AS project_name,
    assigned_profile.full_name AS assigned_to_name,
    assigned_profile.avatar_url AS assigned_to_avatar,
    lead_profile.full_name AS lead_name,
    lead_profile.avatar_url AS lead_avatar,
    reviewer_profile.full_name AS reviewer_name,
    reviewer_profile.avatar_url AS reviewer_avatar
FROM requirements r
LEFT JOIN clients c ON r.client_id = c.id
LEFT JOIN sets s ON r.set_id = s.id
LEFT JOIN projects proj ON s.project_id = proj.id
LEFT JOIN user_profiles assigned_profile ON assigned_profile.user_id = r.assigned_to_id
LEFT JOIN user_profiles lead_profile ON lead_profile.user_id = r.lead_id
LEFT JOIN user_profiles reviewer_profile ON reviewer_profile.user_id = r.reviewer_id
WHERE r.deleted_at IS NULL;

GRANT SELECT ON requirements_with_profiles TO authenticated;

-- Global tasks view (for requirements marked as tasks)
CREATE OR REPLACE VIEW global_tasks AS
SELECT
    r.id,
    r.tenant_id,
    r.client_id,
    r.set_id,
    r.display_id,
    r.title,
    r.description,
    r.status,
    r.priority,
    r.urgency,
    r.importance,
    r.assigned_to_id,
    r.expected_due_date,
    r.completed_date,
    r.created_at,
    r.updated_at,
    c.name as client_name,
    s.name as set_name,
    p.full_name as assigned_to_name
FROM requirements r
LEFT JOIN clients c ON r.client_id = c.id
LEFT JOIN sets s ON r.set_id = s.id
LEFT JOIN user_profiles p ON r.assigned_to_id = p.user_id
WHERE r.is_task = true
  AND r.deleted_at IS NULL
  AND r.status != 'completed'
  AND r.status != 'cancelled';

GRANT SELECT ON global_tasks TO authenticated;

COMMENT ON VIEW global_tasks IS 'Active tasks across all clients for quick access';

-- =============================================================================
-- 5. UPDATE EISENHOWER PRIORITY FUNCTION
-- =============================================================================
-- Priority matrix (Note: 'critical' is only valid for urgency, NOT importance):
-- 1 = Critical urgency + High importance (Crisis - do immediately)
-- 2 = High urgency + High importance (Important & Urgent)
-- 3 = Critical/High urgency + Medium importance, OR Medium urgency + High importance
-- 4 = Low urgency + High importance, OR Medium + Medium, OR Critical + Low
-- 5 = High/Medium urgency + Low importance, OR Low urgency + Medium importance
-- 6 = Low urgency + Low importance (Eliminate quadrant)

CREATE OR REPLACE FUNCTION calculate_eisenhower_priority(
    p_importance TEXT,
    p_urgency TEXT
) RETURNS INTEGER AS $$
DECLARE
    imp TEXT := COALESCE(p_importance, 'medium');
    urg TEXT := COALESCE(p_urgency, 'medium');
BEGIN
    -- Priority 1: Critical urgency + High importance (Crisis - do immediately)
    IF urg = 'critical' AND imp = 'high' THEN
        RETURN 1;
    END IF;

    -- Priority 2: High urgency + High importance (Important & Urgent)
    IF urg = 'high' AND imp = 'high' THEN
        RETURN 2;
    END IF;

    -- Priority 3: Critical/High urgency + Medium importance, OR Medium urgency + High importance
    IF ((urg = 'critical' OR urg = 'high') AND imp = 'medium') OR
       (urg = 'medium' AND imp = 'high') THEN
        RETURN 3;
    END IF;

    -- Priority 4: Low urgency + High importance, OR Medium + Medium, OR Critical + Low
    IF (urg = 'low' AND imp = 'high') OR
       (urg = 'medium' AND imp = 'medium') OR
       (urg = 'critical' AND imp = 'low') THEN
        RETURN 4;
    END IF;

    -- Priority 5: High/Medium urgency + Low importance, OR Low urgency + Medium importance
    IF (urg = 'high' AND imp = 'low') OR
       (urg = 'medium' AND imp = 'low') OR
       (urg = 'low' AND imp = 'medium') THEN
        RETURN 5;
    END IF;

    -- Priority 6: Low urgency + Low importance (Eliminate quadrant) - default fallback
    RETURN 6;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- 6. UPDATE EXISTING RECORDS WITH CORRECT PRIORITY
-- =============================================================================

-- Recalculate priority for all sets
UPDATE sets
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE deleted_at IS NULL;

-- Recalculate priority for all requirements
UPDATE requirements
SET priority = calculate_eisenhower_priority(importance, urgency)
WHERE deleted_at IS NULL;

-- =============================================================================
-- 7. NOTIFY POSTGREST TO RELOAD SCHEMA
-- =============================================================================

NOTIFY pgrst, 'reload schema';
