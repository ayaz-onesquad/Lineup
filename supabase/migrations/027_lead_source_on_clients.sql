-- Migration 027: Add source_lead_id to clients table for lead conversion tracking
-- This enables bidirectional tracking: leads know their converted client, clients know their source lead

-- ============================================================================
-- 1. ADD SOURCE_LEAD_ID TO CLIENTS TABLE
-- ============================================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_lead_id UUID REFERENCES leads(id);

CREATE INDEX IF NOT EXISTS idx_clients_source_lead_id ON clients(source_lead_id);

COMMENT ON COLUMN clients.source_lead_id IS 'Reference to the lead that was converted to create this client';

-- ============================================================================
-- 2. UPDATE CONVERT_LEAD_TO_CLIENT RPC TO SET SOURCE_LEAD_ID
-- ============================================================================

CREATE OR REPLACE FUNCTION convert_lead_to_client(
    p_lead_id UUID,
    p_client_name VARCHAR(255) DEFAULT NULL,
    p_relationship_manager_id UUID DEFAULT NULL,
    p_copy_contacts BOOLEAN DEFAULT true,
    p_copy_documents BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_lead RECORD;
    v_client_id UUID;
    v_contact_mapping JSON := '[]'::JSON;
BEGIN
    -- Get lead
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id AND deleted_at IS NULL;

    IF v_lead IS NULL THEN
        RAISE EXCEPTION 'Lead not found';
    END IF;

    IF v_lead.status = 'won' THEN
        RAISE EXCEPTION 'Lead already converted';
    END IF;

    -- Create client with source_lead_id reference
    INSERT INTO clients (
        tenant_id, name, company_name, overview, status,
        relationship_manager_id, referral_source, source_lead_id, created_by
    ) VALUES (
        v_lead.tenant_id,
        COALESCE(p_client_name, v_lead.lead_name),
        COALESCE(p_client_name, v_lead.lead_name),
        v_lead.description,
        'onboarding',
        p_relationship_manager_id,
        v_lead.source::referral_source,
        p_lead_id,  -- Set source_lead_id to track origin
        auth.uid()
    )
    RETURNING id INTO v_client_id;

    -- Copy contacts if requested
    IF p_copy_contacts THEN
        INSERT INTO client_contacts (tenant_id, client_id, contact_id, is_primary, role, created_by)
        SELECT
            v_lead.tenant_id,
            v_client_id,
            lc.contact_id,
            lc.is_primary,
            lc.role_at_lead,
            auth.uid()
        FROM lead_contacts lc
        WHERE lc.lead_id = p_lead_id AND lc.deleted_at IS NULL;
    END IF;

    -- Copy documents if requested
    IF p_copy_documents THEN
        INSERT INTO documents (
            tenant_id, name, description, file_url, file_type, file_size_bytes,
            entity_type, entity_id, document_catalog_id, uploaded_by
        )
        SELECT
            tenant_id, name, description, file_url, file_type, file_size_bytes,
            'client', v_client_id, document_catalog_id, auth.uid()
        FROM documents
        WHERE entity_type = 'lead' AND entity_id = p_lead_id AND deleted_at IS NULL;
    END IF;

    -- Update lead status to won
    UPDATE leads
    SET status = 'won',
        converted_to_client_id = v_client_id,
        converted_at = NOW(),
        updated_by = auth.uid()
    WHERE id = p_lead_id;

    RETURN json_build_object(
        'lead_id', p_lead_id,
        'client_id', v_client_id,
        'success', true
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION convert_lead_to_client(UUID, VARCHAR, UUID, BOOLEAN, BOOLEAN) TO authenticated;
