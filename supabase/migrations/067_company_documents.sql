-- ============================================================================
-- MIGRATION: Company Documents (SOPs, Protocols, Processing Guides)
-- Version: 067
-- Description: Tenant-level document library for internal governance documents
--              (SOPs, protocols, processing guides, policies, forms, templates).
--              Includes version history, in-app view-only enforcement metadata,
--              and a per-access audit log.
--
-- Security model
--   - Every table carries tenant_id and is RLS-protected (CLAUDE.md Golden Rule).
--   - client_user (portal) can NEVER read company documents.
--   - confidentiality = 'restricted' | 'confidential' is readable only by
--     org_admin / sys_admin or the document owner.
--   - Writes: org_admin anything; org_user may create and may edit/delete rows
--     they own.
--   - access_log is append-only for the acting user; readable only by org_admin.
--
-- AFTER RUNNING: execute supabase/refresh-schema-cache.sql in the SQL Editor.
-- ============================================================================

-- ============================================================================
-- 1. MAIN TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_documents (
  -- Identity
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_id           INTEGER,
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Core descriptive fields
  title                VARCHAR(255) NOT NULL,
  description          TEXT,                    -- rich text (HTML from Tiptap)
  document_type        VARCHAR(50)  NOT NULL DEFAULT 'sop',
  category             VARCHAR(100),
  reference_code       VARCHAR(100),            -- e.g. "SOP-FIN-014"

  -- Lifecycle
  status               VARCHAR(20)  NOT NULL DEFAULT 'draft',
  version              VARCHAR(50)  NOT NULL DEFAULT '1.0',
  effective_date       DATE,
  review_due_date      DATE,
  owner_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Security / handling
  confidentiality      VARCHAR(20)  NOT NULL DEFAULT 'internal',
  allow_download       BOOLEAN      NOT NULL DEFAULT FALSE,  -- view-in-app by default
  watermark_on_view    BOOLEAN      NOT NULL DEFAULT TRUE,
  requires_acknowledgement BOOLEAN  NOT NULL DEFAULT FALSE,

  -- Current file (storage path inside the private `documents` bucket)
  storage_path         TEXT,
  file_name            VARCHAR(500),
  file_type            VARCHAR(255),
  file_size_bytes      BIGINT,
  file_checksum        VARCHAR(128),            -- SHA-256 hex, integrity check

  -- Optional external link instead of an uploaded file
  external_link        TEXT,

  tags                 TEXT[] DEFAULT '{}',

  -- Audit trail
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at           TIMESTAMPTZ,

  CONSTRAINT company_documents_document_type_check CHECK (document_type IN (
    'sop', 'protocol', 'processing_guide', 'policy', 'procedure',
    'form', 'template', 'checklist', 'contract', 'certificate',
    'training', 'other'
  )),
  CONSTRAINT company_documents_status_check CHECK (status IN (
    'draft', 'in_review', 'active', 'archived', 'superseded'
  )),
  CONSTRAINT company_documents_confidentiality_check CHECK (confidentiality IN (
    'public', 'internal', 'restricted', 'confidential'
  )),
  -- A document must point at something: a stored file or an external link
  CONSTRAINT company_documents_has_content CHECK (
    storage_path IS NOT NULL OR external_link IS NOT NULL
  ),
  -- Storage paths must live under the owning tenant's folder (defence in depth
  -- on top of the storage.objects RLS policies from migration 029)
  CONSTRAINT company_documents_storage_path_tenant_scoped CHECK (
    storage_path IS NULL OR storage_path LIKE (tenant_id::text || '/%')
  )
);

-- ============================================================================
-- 2. VERSION HISTORY
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_document_versions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_document_id  UUID NOT NULL REFERENCES company_documents(id) ON DELETE CASCADE,

  version              VARCHAR(50) NOT NULL,
  change_summary       TEXT,

  storage_path         TEXT,
  file_name            VARCHAR(500),
  file_type            VARCHAR(255),
  file_size_bytes      BIGINT,
  file_checksum        VARCHAR(128),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT company_document_versions_storage_path_tenant_scoped CHECK (
    storage_path IS NULL OR storage_path LIKE (tenant_id::text || '/%')
  )
);

-- ============================================================================
-- 3. ACCESS LOG (who viewed / downloaded / printed what, and when)
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_document_access_log (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_document_id  UUID NOT NULL REFERENCES company_documents(id) ON DELETE CASCADE,

  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action               VARCHAR(30) NOT NULL,
  user_agent           TEXT,
  accessed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT company_document_access_log_action_check CHECK (action IN (
    'view', 'download', 'print_blocked', 'download_blocked', 'acknowledge'
  ))
);

-- ============================================================================
-- 4. ACKNOWLEDGEMENTS (read-receipts for mandatory SOPs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_document_acknowledgements (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_document_id  UUID NOT NULL REFERENCES company_documents(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version              VARCHAR(50) NOT NULL,
  acknowledged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (company_document_id, user_id, version)
);

-- ============================================================================
-- 5. DISPLAY_ID + UPDATED_AT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_company_documents_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    max_id INTEGER;
BEGIN
    SELECT COALESCE(MAX(display_id), 0) INTO max_id
    FROM company_documents
    WHERE tenant_id = NEW.tenant_id;

    NEW.display_id := max_id + 1;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_documents_display_id ON company_documents;
CREATE TRIGGER set_company_documents_display_id
    BEFORE INSERT ON company_documents
    FOR EACH ROW
    WHEN (NEW.display_id IS NULL)
    EXECUTE FUNCTION generate_company_documents_display_id();

CREATE OR REPLACE FUNCTION company_documents_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    -- tenant_id is immutable: never allow a row to be moved between tenants
    NEW.tenant_id = OLD.tenant_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_updated_at ON company_documents;
CREATE TRIGGER company_documents_updated_at
    BEFORE UPDATE ON company_documents
    FOR EACH ROW
    EXECUTE FUNCTION company_documents_set_updated_at();

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Is the current user an active member of this tenant with one of these roles?
CREATE OR REPLACE FUNCTION public.company_docs_can_read(
    p_tenant_id UUID,
    p_confidentiality TEXT,
    p_owner_user_id UUID,
    p_created_by UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
      -- sys_admin bypass (support access)
      public.is_sys_admin()
      OR (
        -- must be an active, non-portal member of the owning tenant
        EXISTS (
          SELECT 1 FROM tenant_users tu
          WHERE tu.user_id = auth.uid()
            AND tu.tenant_id = p_tenant_id
            AND tu.status = 'active'
            AND tu.role IN ('org_admin', 'org_user')
        )
        AND (
          -- public/internal: any member of the tenant
          p_confidentiality IN ('public', 'internal')
          -- restricted/confidential: org_admin, the owner, or the author only
          OR public.user_has_role_in_tenant(p_tenant_id, ARRAY['org_admin', 'sys_admin'])
          OR auth.uid() = p_owner_user_id
          OR auth.uid() = p_created_by
        )
      )
$$;

GRANT EXECUTE ON FUNCTION public.company_docs_can_read(UUID, TEXT, UUID, UUID) TO authenticated;

-- May the current user create company documents in this tenant?
CREATE OR REPLACE FUNCTION public.company_docs_can_write(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT public.user_has_role_in_tenant(
        p_tenant_id, ARRAY['org_admin', 'org_user', 'sys_admin']
    )
$$;

GRANT EXECUTE ON FUNCTION public.company_docs_can_write(UUID) TO authenticated;

-- May the current user modify/delete THIS document?
CREATE OR REPLACE FUNCTION public.company_docs_can_manage(
    p_tenant_id UUID,
    p_owner_user_id UUID,
    p_created_by UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
      public.user_has_role_in_tenant(p_tenant_id, ARRAY['org_admin', 'sys_admin'])
      OR (
        public.user_has_role_in_tenant(p_tenant_id, ARRAY['org_user'])
        AND (auth.uid() = p_owner_user_id OR auth.uid() = p_created_by)
      )
$$;

GRANT EXECUTE ON FUNCTION public.company_docs_can_manage(UUID, UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. ROW LEVEL SECURITY — company_documents
-- ============================================================================
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_documents_select" ON company_documents;
CREATE POLICY "company_documents_select" ON company_documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.company_docs_can_read(tenant_id, confidentiality, owner_user_id, created_by)
  );

DROP POLICY IF EXISTS "company_documents_insert" ON company_documents;
CREATE POLICY "company_documents_insert" ON company_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.company_docs_can_write(tenant_id)
    -- the author cannot forge another user as the creator
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "company_documents_update" ON company_documents;
CREATE POLICY "company_documents_update" ON company_documents
  FOR UPDATE TO authenticated
  USING (
    public.company_docs_can_manage(tenant_id, owner_user_id, created_by)
  )
  -- WITH CHECK is required: without it a row could be rewritten into another
  -- tenant or escalated past the manage check.
  WITH CHECK (
    public.company_docs_can_manage(tenant_id, owner_user_id, created_by)
  );

DROP POLICY IF EXISTS "company_documents_delete" ON company_documents;
CREATE POLICY "company_documents_delete" ON company_documents
  FOR DELETE TO authenticated
  USING (
    public.company_docs_can_manage(tenant_id, owner_user_id, created_by)
  );

-- ============================================================================
-- 8. ROW LEVEL SECURITY — company_document_versions
-- ============================================================================
ALTER TABLE company_document_versions ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT `FORCE ROW LEVEL SECURITY`: rows here are written by the
-- company_documents_archive_previous_file trigger, which relies on the
-- definer's RLS exemption. Forcing RLS would make replacing a document's file
-- fail whenever the update came from a context without an auth.uid().


DROP POLICY IF EXISTS "company_document_versions_select" ON company_document_versions;
CREATE POLICY "company_document_versions_select" ON company_document_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_documents d
      WHERE d.id = company_document_versions.company_document_id
        AND d.deleted_at IS NULL
        AND public.company_docs_can_read(d.tenant_id, d.confidentiality, d.owner_user_id, d.created_by)
    )
  );

DROP POLICY IF EXISTS "company_document_versions_insert" ON company_document_versions;
CREATE POLICY "company_document_versions_insert" ON company_document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    (created_by IS NULL OR created_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM company_documents d
      WHERE d.id = company_document_versions.company_document_id
        AND d.tenant_id = company_document_versions.tenant_id
        AND public.company_docs_can_manage(d.tenant_id, d.owner_user_id, d.created_by)
    )
  );

-- Version rows are immutable history: no UPDATE policy is defined, so updates
-- are denied for every non-service role.

DROP POLICY IF EXISTS "company_document_versions_delete" ON company_document_versions;
CREATE POLICY "company_document_versions_delete" ON company_document_versions
  FOR DELETE TO authenticated
  USING (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

-- ============================================================================
-- 9. ROW LEVEL SECURITY — company_document_access_log (append-only)
-- ============================================================================
ALTER TABLE company_document_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_document_access_log FORCE ROW LEVEL SECURITY;

-- Only org_admin can read the log; a user may also read their own entries.
DROP POLICY IF EXISTS "company_document_access_log_select" ON company_document_access_log;
CREATE POLICY "company_document_access_log_select" ON company_document_access_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

-- A user may only append entries for themselves, on documents they can read.
DROP POLICY IF EXISTS "company_document_access_log_insert" ON company_document_access_log;
CREATE POLICY "company_document_access_log_insert" ON company_document_access_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM company_documents d
      WHERE d.id = company_document_access_log.company_document_id
        AND d.tenant_id = company_document_access_log.tenant_id
        AND public.company_docs_can_read(d.tenant_id, d.confidentiality, d.owner_user_id, d.created_by)
    )
  );

-- No UPDATE or DELETE policy: the audit log cannot be altered or erased by any
-- tenant user, including org_admin.

-- ============================================================================
-- 10. ROW LEVEL SECURITY — company_document_acknowledgements
-- ============================================================================
ALTER TABLE company_document_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_document_acknowledgements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_document_acks_select" ON company_document_acknowledgements;
CREATE POLICY "company_document_acks_select" ON company_document_acknowledgements
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

DROP POLICY IF EXISTS "company_document_acks_insert" ON company_document_acknowledgements;
CREATE POLICY "company_document_acks_insert" ON company_document_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM company_documents d
      WHERE d.id = company_document_acknowledgements.company_document_id
        AND d.tenant_id = company_document_acknowledgements.tenant_id
        AND public.company_docs_can_read(d.tenant_id, d.confidentiality, d.owner_user_id, d.created_by)
    )
  );

-- ============================================================================
-- 11. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_company_documents_tenant
  ON company_documents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_type
  ON company_documents(tenant_id, document_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_status
  ON company_documents(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_category
  ON company_documents(tenant_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_review_due
  ON company_documents(tenant_id, review_due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_owner
  ON company_documents(tenant_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_documents_tags
  ON company_documents USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_company_document_versions_doc
  ON company_document_versions(company_document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_document_access_log_doc
  ON company_document_access_log(company_document_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_document_access_log_tenant
  ON company_document_access_log(tenant_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_document_access_log_user
  ON company_document_access_log(user_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_document_acks_doc
  ON company_document_acknowledgements(company_document_id);

-- ============================================================================
-- 12. ARCHIVE PREVIOUS FILE AS A VERSION WHEN THE FILE IS REPLACED
-- ============================================================================
CREATE OR REPLACE FUNCTION company_documents_archive_previous_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only archive when the stored file actually changed and there was one
    IF OLD.storage_path IS NOT NULL
       AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
        INSERT INTO company_document_versions (
            tenant_id, company_document_id, version, change_summary,
            storage_path, file_name, file_type, file_size_bytes, file_checksum,
            created_by
        ) VALUES (
            OLD.tenant_id, OLD.id, OLD.version,
            'Superseded by version ' || NEW.version,
            OLD.storage_path, OLD.file_name, OLD.file_type,
            OLD.file_size_bytes, OLD.file_checksum,
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_archive_previous_file_trigger ON company_documents;
CREATE TRIGGER company_documents_archive_previous_file_trigger
    AFTER UPDATE ON company_documents
    FOR EACH ROW
    EXECUTE FUNCTION company_documents_archive_previous_file();

-- ============================================================================
-- 13. GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON company_documents TO authenticated;
GRANT SELECT, INSERT, DELETE ON company_document_versions TO authenticated;
GRANT SELECT, INSERT ON company_document_access_log TO authenticated;
GRANT SELECT, INSERT ON company_document_acknowledgements TO authenticated;

-- ============================================================================
-- 14. COMMENTS
-- ============================================================================
COMMENT ON TABLE company_documents IS
  'Tenant-level governance document library: SOPs, protocols, processing guides, policies. Not tied to the Client>Project>Phase>Set hierarchy.';
COMMENT ON COLUMN company_documents.allow_download IS
  'FALSE (default) means the file is view-only in the in-app viewer; no download URL is issued.';
COMMENT ON COLUMN company_documents.storage_path IS
  'Path inside the private `documents` bucket. Must start with the owning tenant_id.';
COMMENT ON TABLE company_document_access_log IS
  'Append-only audit log of every view/download attempt. No UPDATE or DELETE policy exists by design.';

-- ============================================================================
-- 15. VERIFICATION
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'company_documents', 'company_document_versions',
  'company_document_access_log', 'company_document_acknowledgements'
)
ORDER BY tablename, policyname;
