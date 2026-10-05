-- ============================================================================
-- MIGRATION: Session Security Policy + Auth Event Audit
-- Version: 068
-- Description: Per-tenant session policy (idle timeout, absolute session
--              lifetime, remember-device allowance) plus an append-only
--              authentication event log.
--
-- Rationale: sessions previously persisted indefinitely in localStorage with
-- silent token refresh, so a user was never signed out. The client now enforces
-- an idle timeout and an absolute session lifetime; those limits are stored
-- here so an OrgAdmin can tighten them per tenant.
--
-- AFTER RUNNING: execute supabase/refresh-schema-cache.sql in the SQL Editor.
-- ============================================================================

-- ============================================================================
-- 1. TENANT SESSION / SECURITY POLICY
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_security_settings (
  tenant_id                 UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

  -- Session lifetime
  idle_timeout_minutes      INTEGER NOT NULL DEFAULT 30,
  absolute_session_hours    INTEGER NOT NULL DEFAULT 12,
  warn_before_logout_seconds INTEGER NOT NULL DEFAULT 60,

  -- Device persistence: when FALSE the session is bound to the browser tab
  -- session and ends when the browser closes.
  allow_remember_device     BOOLEAN NOT NULL DEFAULT TRUE,
  remember_device_days      INTEGER NOT NULL DEFAULT 14,

  -- Document handling
  block_document_download   BOOLEAN NOT NULL DEFAULT FALSE,  -- tenant-wide kill switch
  signed_url_ttl_seconds    INTEGER NOT NULL DEFAULT 120,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT tss_idle_timeout_range CHECK (idle_timeout_minutes BETWEEN 5 AND 480),
  CONSTRAINT tss_absolute_range     CHECK (absolute_session_hours BETWEEN 1 AND 720),
  CONSTRAINT tss_warn_range         CHECK (warn_before_logout_seconds BETWEEN 15 AND 600),
  CONSTRAINT tss_remember_days      CHECK (remember_device_days BETWEEN 1 AND 90),
  CONSTRAINT tss_signed_url_ttl     CHECK (signed_url_ttl_seconds BETWEEN 30 AND 3600)
);

CREATE OR REPLACE FUNCTION tenant_security_settings_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.tenant_id = OLD.tenant_id;  -- immutable
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_security_settings_updated_at ON tenant_security_settings;
CREATE TRIGGER tenant_security_settings_updated_at
    BEFORE UPDATE ON tenant_security_settings
    FOR EACH ROW
    EXECUTE FUNCTION tenant_security_settings_set_updated_at();

ALTER TABLE tenant_security_settings ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT `FORCE ROW LEVEL SECURITY`: the default row for a brand new
-- tenant is inserted by a trigger at a point where the creating user is not yet
-- a member of that tenant, so it depends on the definer's RLS exemption.


-- Every member of the tenant must be able to READ the policy, because the
-- client needs the timeout values to enforce them.
DROP POLICY IF EXISTS "tss_select" ON tenant_security_settings;
CREATE POLICY "tss_select" ON tenant_security_settings
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_user_tenant_ids())
    OR public.is_sys_admin()
  );

-- Only org_admin may change it.
DROP POLICY IF EXISTS "tss_insert" ON tenant_security_settings;
CREATE POLICY "tss_insert" ON tenant_security_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

DROP POLICY IF EXISTS "tss_update" ON tenant_security_settings;
CREATE POLICY "tss_update" ON tenant_security_settings
  FOR UPDATE TO authenticated
  USING (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  )
  WITH CHECK (
    public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin'])
  );

-- No DELETE policy: the policy row is not removable while the tenant exists.

GRANT SELECT, INSERT, UPDATE ON tenant_security_settings TO authenticated;

-- Seed a default row for every existing tenant.
INSERT INTO tenant_security_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Auto-create the policy row for new tenants.
CREATE OR REPLACE FUNCTION create_default_tenant_security_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO tenant_security_settings (tenant_id)
    VALUES (NEW.id)
    ON CONFLICT (tenant_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_tenant_security_settings_trigger ON tenants;
CREATE TRIGGER create_default_tenant_security_settings_trigger
    AFTER INSERT ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION create_default_tenant_security_settings();

-- ============================================================================
-- 2. AUTH EVENT AUDIT LOG (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email         VARCHAR(254),
  event_type    VARCHAR(40) NOT NULL,
  user_agent    TEXT,
  detail        TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'login_success', 'login_failed', 'logout', 'idle_timeout',
    'absolute_timeout', 'password_changed', 'session_refresh_failed',
    'rate_limited'
  ))
);

CREATE INDEX IF NOT EXISTS idx_auth_events_tenant
  ON auth_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_user
  ON auth_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_type
  ON auth_events(event_type, occurred_at DESC);

ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events FORCE ROW LEVEL SECURITY;

-- A user sees their own events; org_admin sees the whole tenant.
DROP POLICY IF EXISTS "auth_events_select" ON auth_events;
CREATE POLICY "auth_events_select" ON auth_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (tenant_id IS NOT NULL
        AND public.user_has_role_in_tenant(tenant_id, ARRAY['org_admin', 'sys_admin']))
    OR public.is_sys_admin()
  );

-- An authenticated user may only append events about themselves.
DROP POLICY IF EXISTS "auth_events_insert" ON auth_events;
CREATE POLICY "auth_events_insert" ON auth_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE/DELETE policy: the log is immutable for tenant users.

GRANT SELECT, INSERT ON auth_events TO authenticated;

-- ============================================================================
-- 3. RPC: resolve the effective session policy for the calling user
-- Returns the strictest policy across the user's active tenants, so a user in
-- two tenants gets the tighter of the two limits.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_effective_session_policy()
RETURNS TABLE (
  idle_timeout_minutes       INTEGER,
  absolute_session_hours     INTEGER,
  warn_before_logout_seconds INTEGER,
  allow_remember_device      BOOLEAN,
  remember_device_days       INTEGER,
  block_document_download    BOOLEAN,
  signed_url_ttl_seconds     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
      COALESCE(MIN(s.idle_timeout_minutes), 30)        AS idle_timeout_minutes,
      COALESCE(MIN(s.absolute_session_hours), 12)      AS absolute_session_hours,
      COALESCE(MIN(s.warn_before_logout_seconds), 60)  AS warn_before_logout_seconds,
      COALESCE(BOOL_AND(s.allow_remember_device), TRUE) AS allow_remember_device,
      COALESCE(MIN(s.remember_device_days), 14)        AS remember_device_days,
      COALESCE(BOOL_OR(s.block_document_download), FALSE) AS block_document_download,
      COALESCE(MIN(s.signed_url_ttl_seconds), 120)     AS signed_url_ttl_seconds
    FROM tenant_security_settings s
    WHERE s.tenant_id IN (
      SELECT tu.tenant_id FROM tenant_users tu
      WHERE tu.user_id = auth.uid() AND tu.status = 'active'
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_session_policy() TO authenticated;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================
COMMENT ON TABLE tenant_security_settings IS
  'Per-tenant session and document-handling policy. Read by every member so the client can enforce idle/absolute session limits.';
COMMENT ON TABLE auth_events IS
  'Append-only authentication audit log. No UPDATE or DELETE policy exists by design.';
COMMENT ON FUNCTION public.get_effective_session_policy() IS
  'Returns the strictest session policy across all tenants the caller belongs to.';

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('tenant_security_settings', 'auth_events')
ORDER BY tablename, policyname;
