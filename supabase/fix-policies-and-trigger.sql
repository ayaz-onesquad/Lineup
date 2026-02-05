-- CORE Platform Fix Script
-- Run this in Supabase SQL Editor to fix policies and trigger

-- ============================================
-- DROP EXISTING POLICIES (safe to run multiple times)
-- ============================================

-- User Profiles Policies
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Tenants Policies
DROP POLICY IF EXISTS "Users can view own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can create tenants" ON tenants;
DROP POLICY IF EXISTS "Admins can update tenants" ON tenants;

-- Tenant Users Policies
DROP POLICY IF EXISTS "Users can view tenant users in their tenants" ON tenant_users;
DROP POLICY IF EXISTS "Admins can insert tenant users" ON tenant_users;
DROP POLICY IF EXISTS "Admins can update tenant users" ON tenant_users;
DROP POLICY IF EXISTS "Admins can delete tenant users" ON tenant_users;

-- Clients Policies
DROP POLICY IF EXISTS "Users can view clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Users can insert clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Users can update clients in their tenants" ON clients;
DROP POLICY IF EXISTS "Admins can delete clients" ON clients;

-- Projects Policies
DROP POLICY IF EXISTS "Users can view projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Users can insert projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Users can update projects in their tenants" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;

-- Project Phases Policies
DROP POLICY IF EXISTS "Users can view phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Users can insert phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Users can update phases in their tenants" ON project_phases;
DROP POLICY IF EXISTS "Admins can delete phases" ON project_phases;

-- Sets Policies
DROP POLICY IF EXISTS "Users can view sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Users can insert sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Users can update sets in their tenants" ON sets;
DROP POLICY IF EXISTS "Admins can delete sets" ON sets;

-- Requirements Policies
DROP POLICY IF EXISTS "Users can view requirements in their tenants" ON requirements;
DROP POLICY IF EXISTS "Users can insert requirements in their tenants" ON requirements;
DROP POLICY IF EXISTS "Users can update requirements in their tenants" ON requirements;
DROP POLICY IF EXISTS "Admins can delete requirements" ON requirements;

-- Documents Policies
DROP POLICY IF EXISTS "Users can view documents in their tenants" ON documents;
DROP POLICY IF EXISTS "Users can insert documents in their tenants" ON documents;
DROP POLICY IF EXISTS "Users can update documents in their tenants" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;

-- Discussions Policies
DROP POLICY IF EXISTS "Users can view discussions in their tenants" ON discussions;
DROP POLICY IF EXISTS "Users can insert discussions in their tenants" ON discussions;
DROP POLICY IF EXISTS "Users can update own discussions" ON discussions;
DROP POLICY IF EXISTS "Users can delete own discussions" ON discussions;

-- Status Updates Policies
DROP POLICY IF EXISTS "Users can view status updates in their tenants" ON status_updates;
DROP POLICY IF EXISTS "Users can insert status updates in their tenants" ON status_updates;

-- ============================================
-- RE-CREATE POLICIES
-- ============================================

-- User Profiles Policies
CREATE POLICY "Users can view all profiles" ON user_profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tenants Policies
CREATE POLICY "Users can view own tenants" ON tenants
    FOR SELECT USING (
        id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND role = 'sys_admin')
    );

CREATE POLICY "Users can create tenants" ON tenants
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can update tenants" ON tenants
    FOR UPDATE USING (
        id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'sys_admin'))
    );

-- Tenant Users Policies
CREATE POLICY "Users can view tenant users in their tenants" ON tenant_users
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users tu WHERE tu.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM tenant_users WHERE user_id = auth.uid() AND role = 'sys_admin')
    );

CREATE POLICY "Admins can insert tenant users" ON tenant_users
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'sys_admin'))
        OR NOT EXISTS (SELECT 1 FROM tenant_users WHERE tenant_id = tenant_users.tenant_id)
    );

CREATE POLICY "Admins can update tenant users" ON tenant_users
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'sys_admin'))
    );

CREATE POLICY "Admins can delete tenant users" ON tenant_users
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'sys_admin'))
    );

-- Clients Policies
CREATE POLICY "Users can view clients in their tenants" ON clients
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert clients in their tenants" ON clients
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update clients in their tenants" ON clients
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete clients" ON clients
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Projects Policies
CREATE POLICY "Users can view projects in their tenants" ON projects
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert projects in their tenants" ON projects
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update projects in their tenants" ON projects
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete projects" ON projects
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Project Phases Policies
CREATE POLICY "Users can view phases in their tenants" ON project_phases
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert phases in their tenants" ON project_phases
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update phases in their tenants" ON project_phases
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete phases" ON project_phases
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Sets Policies
CREATE POLICY "Users can view sets in their tenants" ON sets
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert sets in their tenants" ON sets
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update sets in their tenants" ON sets
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete sets" ON sets
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Requirements Policies
CREATE POLICY "Users can view requirements in their tenants" ON requirements
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert requirements in their tenants" ON requirements
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update requirements in their tenants" ON requirements
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Admins can delete requirements" ON requirements
    FOR DELETE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Documents Policies
CREATE POLICY "Users can view documents in their tenants" ON documents
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert documents in their tenants" ON documents
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can update documents in their tenants" ON documents
    FOR UPDATE USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (
        uploaded_by = auth.uid() OR
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Discussions Policies
CREATE POLICY "Users can view discussions in their tenants" ON discussions
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert discussions in their tenants" ON discussions
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can update own discussions" ON discussions
    FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "Users can delete own discussions" ON discussions
    FOR DELETE USING (
        author_id = auth.uid() OR
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role = 'org_admin')
    );

-- Status Updates Policies
CREATE POLICY "Users can view status updates in their tenants" ON status_updates
    FOR SELECT USING (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can insert status updates in their tenants" ON status_updates
    FOR INSERT WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() AND role IN ('org_admin', 'org_user'))
    );

-- ============================================
-- RE-CREATE TRIGGER FOR USER PROFILE ON SIGNUP
-- ============================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- CREATE PROFILE FOR EXISTING USERS (if missing)
-- ============================================

INSERT INTO public.user_profiles (user_id, full_name)
SELECT
    id,
    COALESCE(raw_user_meta_data->>'full_name', email)
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_profiles)
ON CONFLICT (user_id) DO NOTHING;

-- Verify the trigger exists
SELECT
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
