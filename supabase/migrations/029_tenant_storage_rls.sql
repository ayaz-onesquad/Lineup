-- Migration 029: Tenant-Based Storage RLS Policies
-- Enforces tenant isolation in Supabase Storage via folder path structure
-- Path format: {tenantId}/{userId}/{entityType}/{entityId}/{filename}
--
-- NOTE: Functions are created in PUBLIC schema (not storage) due to Supabase restrictions

-- ============================================================================
-- 1. HELPER FUNCTION: Get tenant_id from JWT claims
-- This function extracts tenant_id from the JWT metadata if present
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_storage_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_raw_claims JSONB;
BEGIN
    -- Try to get tenant_id from JWT app_metadata
    v_raw_claims := auth.jwt() -> 'app_metadata';

    IF v_raw_claims IS NOT NULL AND v_raw_claims ? 'tenant_id' THEN
        v_tenant_id := (v_raw_claims ->> 'tenant_id')::UUID;
        RETURN v_tenant_id;
    END IF;

    -- Fallback: get active tenant from tenant_users
    -- (this covers cases where JWT doesn't have tenant_id yet)
    SELECT tu.tenant_id INTO v_tenant_id
    FROM tenant_users tu
    WHERE tu.user_id = auth.uid()
    LIMIT 1;

    RETURN v_tenant_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_storage_tenant_id() TO authenticated;

-- ============================================================================
-- 2. HELPER FUNCTION: Validate folder path matches user's tenant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_storage_tenant_path(path_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_path_tenant_id UUID;
    v_user_tenant_id UUID;
    v_path_parts TEXT[];
BEGIN
    -- Parse the path to extract tenant_id (first segment)
    v_path_parts := string_to_array(path_name, '/');

    -- Path must have at least tenant_id segment
    IF array_length(v_path_parts, 1) < 1 THEN
        RETURN FALSE;
    END IF;

    -- Try to cast first segment to UUID (tenant_id)
    BEGIN
        v_path_tenant_id := v_path_parts[1]::UUID;
    EXCEPTION WHEN OTHERS THEN
        -- Invalid UUID format - reject
        RETURN FALSE;
    END;

    -- Check if user belongs to this tenant
    SELECT tenant_id INTO v_user_tenant_id
    FROM tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = v_path_tenant_id
    LIMIT 1;

    RETURN v_user_tenant_id IS NOT NULL;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.validate_storage_tenant_path(TEXT) TO authenticated;

-- ============================================================================
-- 3. STORAGE BUCKET POLICIES
-- These policies enforce tenant isolation via folder structure
-- ============================================================================

-- Drop existing policies if they exist (clean slate)
DO $$
BEGIN
    -- Drop upload policy
    DROP POLICY IF EXISTS "tenant_upload_policy" ON storage.objects;
    -- Drop read policy
    DROP POLICY IF EXISTS "tenant_read_policy" ON storage.objects;
    -- Drop delete policy
    DROP POLICY IF EXISTS "tenant_delete_policy" ON storage.objects;
    -- Drop update policy
    DROP POLICY IF EXISTS "tenant_update_policy" ON storage.objects;
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if table doesn't exist yet
    NULL;
END $$;

-- Policy: Users can only upload to their tenant's folder
CREATE POLICY "tenant_upload_policy" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'documents' AND
        public.validate_storage_tenant_path(name)
    );

-- Policy: Users can only read files from their tenant's folder
CREATE POLICY "tenant_read_policy" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'documents' AND
        public.validate_storage_tenant_path(name)
    );

-- Policy: Users can only update files in their tenant's folder
CREATE POLICY "tenant_update_policy" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'documents' AND
        public.validate_storage_tenant_path(name)
    );

-- Policy: Users can only delete files from their tenant's folder
CREATE POLICY "tenant_delete_policy" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'documents' AND
        public.validate_storage_tenant_path(name)
    );

-- ============================================================================
-- 4. TRIGGER: Sync tenant_id to JWT on login/tenant switch
-- This trigger updates the user's JWT claims with their active tenant_id
-- ============================================================================

-- Function to update user's app_metadata with tenant_id
CREATE OR REPLACE FUNCTION sync_tenant_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the user's app_metadata with their tenant_id
    -- This will be included in future JWT tokens
    UPDATE auth.users
    SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb) ||
        jsonb_build_object('tenant_id', NEW.tenant_id::text)
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$;

-- Trigger to sync tenant_id when user is added to a tenant
DROP TRIGGER IF EXISTS sync_tenant_to_jwt_trigger ON tenant_users;
CREATE TRIGGER sync_tenant_to_jwt_trigger
    AFTER INSERT ON tenant_users
    FOR EACH ROW
    EXECUTE FUNCTION sync_tenant_to_jwt();

-- ============================================================================
-- 5. BACKFILL: Update existing users' app_metadata
-- ============================================================================

-- Backfill tenant_id into app_metadata for existing users
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT ON (user_id) user_id, tenant_id
        FROM tenant_users
        ORDER BY user_id, created_at DESC
    LOOP
        UPDATE auth.users
        SET raw_app_meta_data =
            COALESCE(raw_app_meta_data, '{}'::jsonb) ||
            jsonb_build_object('tenant_id', r.tenant_id::text)
        WHERE id = r.user_id;
    END LOOP;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.get_storage_tenant_id() IS
    'Extracts tenant_id from JWT claims or falls back to tenant_users lookup';

COMMENT ON FUNCTION public.validate_storage_tenant_path(TEXT) IS
    'Validates that a storage path belongs to the current user''s tenant';

COMMENT ON FUNCTION sync_tenant_to_jwt() IS
    'Syncs tenant_id to user app_metadata for JWT inclusion';
