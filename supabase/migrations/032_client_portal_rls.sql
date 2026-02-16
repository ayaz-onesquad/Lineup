-- Migration 032: Client Portal RLS Policies
-- Adds RLS policies for client_user role to access portal-visible content

-- ============================================================================
-- RLS for client_user access to sets
-- ============================================================================

-- Client users can SELECT sets that are portal-visible AND belong to their client
CREATE POLICY "client_user_select_portal_sets" ON sets
    FOR SELECT USING (
        show_in_client_portal = true
        AND client_id IN (
            SELECT cu.client_id FROM client_users cu
            WHERE cu.user_id = auth.uid()
        )
    );

-- ============================================================================
-- RLS for client_user access to requirements
-- ============================================================================

-- Client users can SELECT requirements that are portal-visible AND belong to visible sets
CREATE POLICY "client_user_select_portal_requirements" ON requirements
    FOR SELECT USING (
        show_in_client_portal = true
        AND (
            -- Direct client match
            client_id IN (
                SELECT cu.client_id FROM client_users cu
                WHERE cu.user_id = auth.uid()
            )
            -- OR through set linkage
            OR set_id IN (
                SELECT s.id FROM sets s
                WHERE s.show_in_client_portal = true
                AND s.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            )
        )
    );

-- ============================================================================
-- RLS for client_user access to documents
-- ============================================================================

-- Client users can SELECT documents that are portal-visible
-- Documents are already filtered by entity linkage in the application layer
CREATE POLICY "client_user_select_portal_documents" ON documents
    FOR SELECT USING (
        show_in_portal = true
        AND (
            -- Project documents
            (parent_entity_type = 'project' AND parent_entity_id IN (
                SELECT p.id FROM projects p
                WHERE p.show_in_client_portal = true
                AND p.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            ))
            -- Set documents
            OR (parent_entity_type = 'set' AND parent_entity_id IN (
                SELECT s.id FROM sets s
                WHERE s.show_in_client_portal = true
                AND s.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            ))
            -- Requirement documents
            OR (parent_entity_type = 'requirement' AND parent_entity_id IN (
                SELECT r.id FROM requirements r
                WHERE r.show_in_client_portal = true
                AND r.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            ))
            -- Phase documents
            OR (parent_entity_type = 'phase' AND parent_entity_id IN (
                SELECT ph.id FROM project_phases ph
                JOIN projects p ON ph.project_id = p.id
                WHERE ph.show_in_client_portal = true
                AND p.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            ))
            -- Pitch documents
            OR (parent_entity_type = 'pitch' AND parent_entity_id IN (
                SELECT pi.id FROM pitches pi
                JOIN sets s ON pi.set_id = s.id
                WHERE s.show_in_client_portal = true
                AND s.client_id IN (
                    SELECT cu.client_id FROM client_users cu
                    WHERE cu.user_id = auth.uid()
                )
            ))
        )
    );
