-- Migration 033: Support Tickets System
-- Enables users to submit support tickets from any page
-- Visibility: OrgUsers (own), OrgAdmins (tenant), SysAdmins (all)

-- Create ticket type enum
DO $$ BEGIN
    CREATE TYPE ticket_type AS ENUM ('incident', 'information', 'improvement');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create ticket status enum
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id SERIAL,
    ticket_id_display VARCHAR(20) GENERATED ALWAYS AS ('TKT-' || LPAD(display_id::TEXT, 5, '0')) STORED,

    -- Core fields
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES auth.users(id),

    -- Ticket content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type ticket_type NOT NULL DEFAULT 'information',
    status ticket_status NOT NULL DEFAULT 'open',

    -- Context
    page_url TEXT,

    -- Resolution
    resolution TEXT,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT support_tickets_title_length CHECK (char_length(title) >= 3)
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_submitted_by ON support_tickets(submitted_by);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_type ON support_tickets(type);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- SysAdmin: Can see all tickets across all tenants
CREATE POLICY "sys_admin_full_access" ON support_tickets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = auth.uid()
            AND role = 'sys_admin'
        )
    );

-- OrgAdmin: Can see all tickets in their tenant
CREATE POLICY "org_admin_tenant_access" ON support_tickets
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
            AND role = 'org_admin'
        )
    );

-- OrgAdmin: Can update tickets in their tenant (for internal resolution)
CREATE POLICY "org_admin_tenant_update" ON support_tickets
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
            AND role = 'org_admin'
        )
    );

-- OrgUser/ClientUser: Can see only their own tickets
CREATE POLICY "user_own_tickets_select" ON support_tickets
    FOR SELECT USING (
        submitted_by = auth.uid()
        AND tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
        )
    );

-- All authenticated users can create tickets for their tenant
CREATE POLICY "users_create_tickets" ON support_tickets
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
        )
        AND submitted_by = auth.uid()
    );

-- Users can update only their own open tickets (e.g., add details)
CREATE POLICY "user_update_own_open_tickets" ON support_tickets
    FOR UPDATE USING (
        submitted_by = auth.uid()
        AND status = 'open'
        AND tenant_id IN (
            SELECT tenant_id FROM tenant_users
            WHERE user_id = auth.uid()
        )
    );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_support_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_ticket_updated_at ON support_tickets;
CREATE TRIGGER support_ticket_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_support_ticket_timestamp();

-- Create view for ticket statistics (SysAdmin dashboard)
CREATE OR REPLACE VIEW support_ticket_stats AS
SELECT
    tenant_id,
    type,
    status,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7_days,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days
FROM support_tickets
WHERE deleted_at IS NULL
GROUP BY tenant_id, type, status;

-- Create view for all tickets with submitter info (for SysAdmin)
CREATE OR REPLACE VIEW support_tickets_with_submitter AS
SELECT
    st.*,
    t.name as tenant_name,
    up.full_name as submitter_name,
    au.email as submitter_email
FROM support_tickets st
LEFT JOIN tenants t ON st.tenant_id = t.id
LEFT JOIN user_profiles up ON st.submitted_by = up.user_id
LEFT JOIN auth.users au ON st.submitted_by = au.id
WHERE st.deleted_at IS NULL;

-- Grant access to views
GRANT SELECT ON support_ticket_stats TO authenticated;
GRANT SELECT ON support_tickets_with_submitter TO authenticated;

-- Comment for documentation
COMMENT ON TABLE support_tickets IS 'Support tickets submitted by users from any page. Visibility: OrgUsers see own, OrgAdmins see tenant, SysAdmins see all.';
COMMENT ON COLUMN support_tickets.page_url IS 'The URL of the page where the ticket was submitted from (auto-captured)';
COMMENT ON COLUMN support_tickets.type IS 'Incident (bug/issue), Information (question), Improvement (feature request)';
