-- CORE Platform Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ============================================
-- TENANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    plan_tier TEXT NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter', 'professional', 'business')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TENANT USERS TABLE (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'org_user' CHECK (role IN ('org_admin', 'org_user', 'client_user', 'sys_admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

-- ============================================
-- CLIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    portal_enabled BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- PROJECTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    project_code TEXT NOT NULL,
    lead_id UUID REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    health TEXT NOT NULL DEFAULT 'on_track' CHECK (health IN ('on_track', 'at_risk', 'delayed')),
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    expected_start_date DATE,
    expected_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    show_in_client_portal BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- PROJECT PHASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS project_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    phase_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')),
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    expected_start_date DATE,
    expected_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    owner_id UUID REFERENCES auth.users(id),
    show_in_client_portal BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- SETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    set_order INTEGER NOT NULL DEFAULT 0,
    urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high')),
    importance TEXT NOT NULL DEFAULT 'medium' CHECK (importance IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    due_date DATE,
    owner_id UUID REFERENCES auth.users(id),
    show_in_client_portal BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- REQUIREMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    set_id UUID NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    requirement_order INTEGER NOT NULL DEFAULT 0,
    requirement_type TEXT NOT NULL DEFAULT 'task' CHECK (requirement_type IN ('task', 'open_item', 'technical', 'support', 'internal_deliverable', 'client_deliverable')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')),
    requires_document BOOLEAN DEFAULT FALSE,
    requires_review BOOLEAN DEFAULT FALSE,
    reviewer_id UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    due_date DATE,
    estimated_hours DECIMAL(10, 2),
    actual_hours DECIMAL(10, 2),
    assigned_to_id UUID REFERENCES auth.users(id),
    completed_at TIMESTAMPTZ,
    show_in_client_portal BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'project', 'phase', 'set', 'requirement')),
    entity_id UUID NOT NULL,
    show_in_client_portal BOOLEAN DEFAULT FALSE,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- DISCUSSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS discussions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'project', 'phase', 'set', 'requirement')),
    entity_id UUID NOT NULL,
    parent_discussion_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT TRUE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- ============================================
-- STATUS UPDATES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS status_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'phase', 'set', 'requirement')),
    entity_id UUID NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    update_type TEXT NOT NULL DEFAULT 'general' CHECK (update_type IN ('general', 'milestone', 'blocker', 'completed')),
    previous_status TEXT,
    new_status TEXT,
    show_in_client_portal BOOLEAN DEFAULT FALSE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_tenant_id ON project_phases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sets_project_id ON sets(project_id);
CREATE INDEX IF NOT EXISTS idx_sets_phase_id ON sets(phase_id);
CREATE INDEX IF NOT EXISTS idx_sets_tenant_id ON sets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requirements_set_id ON requirements(set_id);
CREATE INDEX IF NOT EXISTS idx_requirements_tenant_id ON requirements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_requirements_assigned_to ON requirements(assigned_to_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_discussions_entity ON discussions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_status_updates_entity ON status_updates(entity_type, entity_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_updates ENABLE ROW LEVEL SECURITY;

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
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_phases_updated_at BEFORE UPDATE ON project_phases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sets_updated_at BEFORE UPDATE ON sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_requirements_updated_at BEFORE UPDATE ON requirements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussions_updated_at BEFORE UPDATE ON discussions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION TO CREATE USER PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- FUNCTION TO GENERATE PROJECT CODE
-- ============================================
CREATE OR REPLACE FUNCTION generate_project_code(client_name TEXT, tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    next_num INTEGER;
    code TEXT;
BEGIN
    -- Get first 3 letters of client name, uppercase
    prefix := UPPER(SUBSTRING(REGEXP_REPLACE(client_name, '[^a-zA-Z]', '', 'g'), 1, 3));
    IF LENGTH(prefix) < 3 THEN
        prefix := prefix || REPEAT('X', 3 - LENGTH(prefix));
    END IF;

    -- Get next number for this prefix in this tenant
    SELECT COALESCE(MAX(CAST(SUBSTRING(project_code FROM 5) AS INTEGER)), 0) + 1
    INTO next_num
    FROM projects
    WHERE projects.tenant_id = generate_project_code.tenant_id
    AND project_code LIKE prefix || '-%';

    code := prefix || '-' || LPAD(next_num::TEXT, 3, '0');
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STORAGE BUCKET FOR DOCUMENTS
-- ============================================
-- Run this in the Supabase Dashboard > Storage
-- Create a bucket named 'documents' with public access disabled

-- Storage policies (run in SQL editor after creating the bucket)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- CREATE POLICY "Users can upload documents" ON storage.objects
--     FOR INSERT WITH CHECK (
--         bucket_id = 'documents' AND
--         auth.role() = 'authenticated'
--     );

-- CREATE POLICY "Users can view documents in their tenants" ON storage.objects
--     FOR SELECT USING (
--         bucket_id = 'documents' AND
--         auth.role() = 'authenticated'
--     );

-- CREATE POLICY "Users can delete own documents" ON storage.objects
--     FOR DELETE USING (
--         bucket_id = 'documents' AND
--         auth.uid()::text = (storage.foldername(name))[1]
--     );
