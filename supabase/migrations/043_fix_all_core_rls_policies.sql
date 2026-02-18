-- Migration 043: Fix all core table RLS policies to use SECURITY DEFINER helpers
--
-- ISSUE: Core tables (clients, projects, phases, sets, requirements, contacts)
-- use direct queries to tenant_users in RLS policies, causing recursion issues
-- in production.
--
-- SOLUTION: Update all policies to use get_user_tenant_ids() and
-- user_has_role_in_tenant() functions which are SECURITY DEFINER.

-- ============================================================================
-- 1. CLIENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Users can insert clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Users can update clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Admins can delete clients" ON clients;
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;

CREATE POLICY "clients_select_policy" ON clients
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_insert_policy" ON clients
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_update_policy" ON clients
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "clients_delete_policy" ON clients
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 2. PROJECTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Users can insert projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Users can update projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
DROP POLICY IF EXISTS "projects_insert_policy" ON projects;
DROP POLICY IF EXISTS "projects_update_policy" ON projects;
DROP POLICY IF EXISTS "projects_delete_policy" ON projects;

CREATE POLICY "projects_select_policy" ON projects
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "projects_insert_policy" ON projects
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "projects_update_policy" ON projects
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "projects_delete_policy" ON projects
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 3. PROJECT_PHASES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Users can insert phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Users can update phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Admins can delete phases" ON project_phases;
DROP POLICY IF EXISTS "project_phases_select_policy" ON project_phases;
DROP POLICY IF EXISTS "project_phases_insert_policy" ON project_phases;
DROP POLICY IF EXISTS "project_phases_update_policy" ON project_phases;
DROP POLICY IF EXISTS "project_phases_delete_policy" ON project_phases;

CREATE POLICY "project_phases_select_policy" ON project_phases
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "project_phases_insert_policy" ON project_phases
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "project_phases_update_policy" ON project_phases
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "project_phases_delete_policy" ON project_phases
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 4. SETS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Users can insert sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Users can update sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Admins can delete sets" ON sets;
DROP POLICY IF EXISTS "sets_select_policy" ON sets;
DROP POLICY IF EXISTS "sets_insert_policy" ON sets;
DROP POLICY IF EXISTS "sets_update_policy" ON sets;
DROP POLICY IF EXISTS "sets_delete_policy" ON sets;

CREATE POLICY "sets_select_policy" ON sets
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "sets_insert_policy" ON sets
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "sets_update_policy" ON sets
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "sets_delete_policy" ON sets
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 5. REQUIREMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view requirements in their tenants" ON requirements;
DROP POLICY IF EXISTS "Users can insert requirements" ON requirements;
DROP POLICY IF EXISTS "Users can update requirements" ON requirements;
DROP POLICY IF EXISTS "Admins can delete requirements" ON requirements;
DROP POLICY IF EXISTS "requirements_select_policy" ON requirements;
DROP POLICY IF EXISTS "requirements_insert_policy" ON requirements;
DROP POLICY IF EXISTS "requirements_update_policy" ON requirements;
DROP POLICY IF EXISTS "requirements_delete_policy" ON requirements;

CREATE POLICY "requirements_select_policy" ON requirements
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "requirements_insert_policy" ON requirements
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "requirements_update_policy" ON requirements
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "requirements_delete_policy" ON requirements
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 6. CONTACTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view contacts in their tenants" ON contacts;
DROP POLICY IF EXISTS "Users can insert contacts in their tenants" ON contacts;
DROP POLICY IF EXISTS "Users can update contacts in their tenants" ON contacts;
DROP POLICY IF EXISTS "Admins can delete contacts" ON contacts;
DROP POLICY IF EXISTS "contacts_select_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_insert_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_update_policy" ON contacts;
DROP POLICY IF EXISTS "contacts_delete_policy" ON contacts;

CREATE POLICY "contacts_select_policy" ON contacts
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_insert_policy" ON contacts
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_update_policy" ON contacts
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "contacts_delete_policy" ON contacts
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 7. PITCHES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view pitches in their tenants" ON pitches;
DROP POLICY IF EXISTS "Users can insert pitches in their tenants" ON pitches;
DROP POLICY IF EXISTS "Users can update pitches in their tenants" ON pitches;
DROP POLICY IF EXISTS "Admins can delete pitches" ON pitches;
DROP POLICY IF EXISTS "pitches_select_policy" ON pitches;
DROP POLICY IF EXISTS "pitches_insert_policy" ON pitches;
DROP POLICY IF EXISTS "pitches_update_policy" ON pitches;
DROP POLICY IF EXISTS "pitches_delete_policy" ON pitches;

CREATE POLICY "pitches_select_policy" ON pitches
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_insert_policy" ON pitches
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_update_policy" ON pitches
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "pitches_delete_policy" ON pitches
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 8. CLIENT_CONTACTS TABLE (join table)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view client_contacts in their tenants" ON client_contacts;
DROP POLICY IF EXISTS "Users can insert client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can update client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "Users can delete client_contacts" ON client_contacts;
DROP POLICY IF EXISTS "client_contacts_select_policy" ON client_contacts;
DROP POLICY IF EXISTS "client_contacts_insert_policy" ON client_contacts;
DROP POLICY IF EXISTS "client_contacts_update_policy" ON client_contacts;
DROP POLICY IF EXISTS "client_contacts_delete_policy" ON client_contacts;

CREATE POLICY "client_contacts_select_policy" ON client_contacts
    FOR SELECT USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        OR public.is_sys_admin()
    );

CREATE POLICY "client_contacts_insert_policy" ON client_contacts
    FOR INSERT WITH CHECK (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "client_contacts_update_policy" ON client_contacts
    FOR UPDATE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin', 'org_user'])
        )
        OR public.is_sys_admin()
    );

CREATE POLICY "client_contacts_delete_policy" ON client_contacts
    FOR DELETE USING (
        (
            tenant_id IN (SELECT public.get_user_tenant_ids())
            AND public.user_has_role_in_tenant(tenant_id, ARRAY['sys_admin', 'org_admin'])
        )
        OR public.is_sys_admin()
    );

-- ============================================================================
-- 9. Comments
-- ============================================================================
COMMENT ON POLICY "clients_select_policy" ON clients IS
    'Users can view clients in tenants they belong to. Uses SECURITY DEFINER function to avoid RLS recursion.';
