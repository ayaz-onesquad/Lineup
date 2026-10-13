-- ============================================================================
-- MIGRATION: Password Manager — Encryption at Rest + Access Log
-- Version: 070
--
-- PROBLEM
--   `passwords.password` stored every credential as plaintext TEXT, and
--   `passwordsApi.getAll` selected it with `*`. Consequences:
--     - Anyone with read access to the database (a backup, a snapshot, a
--       support query, a leaked connection string) read every credential.
--     - Every org_admin's browser received every plaintext credential on the
--       list page, whether or not they opened a record.
--     - There was no record of who revealed which credential, and when.
--
-- SOLUTION
--   1. Credentials are encrypted with pgcrypto (`pgp_sym_encrypt`) under a key
--      held in Supabase Vault, which keeps it encrypted under a root key that
--      lives outside the database.
--   2. SELECT on the secret columns is REVOKED from `authenticated`, so the
--      ciphertext never reaches a browser and a `select('*')` cannot leak it.
--   3. Reading, writing and revealing a credential all go through SECURITY
--      DEFINER RPCs that re-check authorisation and write an access log row.
--
-- ORDERING REQUIREMENT
--   Apply this migration BEFORE deploying the matching frontend. The frontend
--   switches the password manager to the RPCs below; the old direct-column
--   queries will fail once the REVOKE lands, which is the intended behaviour.
--
-- AFTER RUNNING: execute supabase/refresh-schema-cache.sql in the SQL Editor.
-- ============================================================================

-- pgcrypto supplies pgp_sym_encrypt / pgp_sym_decrypt / gen_random_bytes.
-- On Supabase it is normally already installed in the `extensions` schema. The
-- DO block tolerates it being installed elsewhere, and the session search_path
-- below means the calls in this file resolve either way.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        BEGIN
            CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
        EXCEPTION WHEN invalid_schema_name THEN
            CREATE EXTENSION pgcrypto;
        END;
    END IF;
END $$;

-- Applies for the rest of this migration script only.
SET search_path = public, extensions;

-- ============================================================================
-- 1. ENCRYPTION KEY IN SUPABASE VAULT
--
-- Vault stores the secret encrypted under a root key managed outside Postgres,
-- so a database dump alone does not yield the credentials. This migration
-- aborts if Vault is unavailable rather than silently falling back to a key
-- stored in a regular table, which would provide no protection at all.
-- ============================================================================
DO $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = 'vault'
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION
            'Supabase Vault is not available on this project. Enable it (Dashboard > Integrations > Vault) and re-run migration 070. Refusing to store the encryption key in a plain table.';
    END IF;

    -- Create the key once. A 32-byte random value, base64 encoded.
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'lineup_password_manager_key') THEN
        PERFORM vault.create_secret(
            encode(gen_random_bytes(32), 'base64'),
            'lineup_password_manager_key',
            'Symmetric key for the LineUp password manager (migration 070). Rotating this requires re-encrypting every row.'
        );
        RAISE NOTICE 'Created Vault secret lineup_password_manager_key';
    ELSE
        RAISE NOTICE 'Vault secret lineup_password_manager_key already exists; reusing it';
    END IF;
END $$;

/**
 * Returns the password-manager key. SECURITY DEFINER and granted to NOBODY:
 * only the other functions in this migration (which run as the definer) can
 * reach it.
 */
CREATE OR REPLACE FUNCTION public.password_manager_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, vault, extensions, pg_temp
AS $$
DECLARE
    v_key TEXT;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'lineup_password_manager_key';

    IF v_key IS NULL THEN
        RAISE EXCEPTION 'Password manager encryption key is missing from Vault';
    END IF;

    RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.password_manager_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.password_manager_key() FROM anon, authenticated;

-- ============================================================================
-- 2. SCHEMA CHANGES
-- ============================================================================
ALTER TABLE passwords ADD COLUMN IF NOT EXISTS password_encrypted BYTEA;
ALTER TABLE passwords ALTER COLUMN password DROP NOT NULL;

-- Backfill ciphertext from any remaining plaintext, then clear the plaintext.
DO $$
DECLARE
    v_key TEXT := public.password_manager_key();
    v_migrated INTEGER;
BEGIN
    UPDATE passwords
    SET password_encrypted = pgp_sym_encrypt(password, v_key)
    WHERE password IS NOT NULL
      AND password_encrypted IS NULL;

    GET DIAGNOSTICS v_migrated = ROW_COUNT;
    RAISE NOTICE 'Encrypted % credential(s)', v_migrated;

    -- Remove the plaintext. The column itself is dropped in a follow-up
    -- migration, once the encrypted path has been verified in production.
    UPDATE passwords SET password = NULL WHERE password IS NOT NULL;
END $$;

COMMENT ON COLUMN passwords.password IS
  'DEPRECATED and always NULL. Superseded by password_encrypted in migration 070. Scheduled for removal.';
COMMENT ON COLUMN passwords.password_encrypted IS
  'pgp_sym_encrypt ciphertext. Never selectable by `authenticated`; read only through password_reveal().';

-- Keep the deprecated column empty.
ALTER TABLE passwords DROP CONSTRAINT IF EXISTS passwords_plaintext_must_be_null;
ALTER TABLE passwords ADD CONSTRAINT passwords_plaintext_must_be_null
  CHECK (password IS NULL);

-- ============================================================================
-- 3. ACCESS LOG (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS password_access_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  password_id   UUID NOT NULL REFERENCES passwords(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        VARCHAR(20) NOT NULL,
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT password_access_log_action_check
    CHECK (action IN ('reveal', 'create', 'update', 'delete'))
);

CREATE INDEX IF NOT EXISTS idx_password_access_log_password
  ON password_access_log(password_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_access_log_tenant
  ON password_access_log(tenant_id, accessed_at DESC);

ALTER TABLE password_access_log ENABLE ROW LEVEL SECURITY;
-- Deliberately NOT `FORCE ROW LEVEL SECURITY`. This table has no INSERT policy
-- at all: rows are written only by the SECURITY DEFINER functions below, which
-- rely on the definer's RLS exemption. Forcing RLS here would make every one of
-- those functions fail on its audit write, which would break create, update,
-- reveal and delete outright.

-- Readable by the tenant's admins (the only people who can use the feature).
DROP POLICY IF EXISTS "password_access_log_select" ON password_access_log;
CREATE POLICY "password_access_log_select" ON password_access_log
  FOR SELECT TO authenticated
  USING (public.is_org_admin_of_tenant(tenant_id));

-- Rows are written only by the SECURITY DEFINER functions below, never
-- directly, so there is no INSERT/UPDATE/DELETE policy at all.
GRANT SELECT ON password_access_log TO authenticated;

-- ============================================================================
-- 4. COLUMN-LEVEL REVOKE
--
-- This is the control that actually stops credentials reaching the browser.
-- With SELECT revoked on these columns, `select('*')` from the client fails and
-- the only path to a secret is password_reveal().
-- ============================================================================
REVOKE SELECT (password, password_encrypted) ON passwords FROM authenticated;
REVOKE SELECT (password, password_encrypted) ON passwords FROM anon;
REVOKE INSERT (password, password_encrypted) ON passwords FROM authenticated, anon;
REVOKE UPDATE (password, password_encrypted) ON passwords FROM authenticated, anon;

-- Everything else on the table stays readable/writable under the existing RLS
-- policies from migrations 048/049.
GRANT SELECT (
  id, display_id, tenant_id, application_name, url, username, email,
  category, notes, password_changed_at,
  created_at, created_by, updated_at, updated_by, deleted_at
) ON passwords TO authenticated;

GRANT INSERT (
  id, display_id, tenant_id, application_name, url, username, email,
  category, notes, password_changed_at,
  created_at, created_by, updated_at, updated_by, deleted_at
) ON passwords TO authenticated;

GRANT UPDATE (
  application_name, url, username, email,
  category, notes, password_changed_at,
  updated_at, updated_by, deleted_at
) ON passwords TO authenticated;

GRANT DELETE ON passwords TO authenticated;

-- ============================================================================
-- 5. RPCs
-- ============================================================================

/**
 * Creates a credential. The secret is encrypted inside the database, so it is
 * never stored in plaintext even transiently.
 */
CREATE OR REPLACE FUNCTION public.password_create(
    p_tenant_id         UUID,
    p_application_name  TEXT,
    p_password          TEXT,
    p_url               TEXT DEFAULT NULL,
    p_username          TEXT DEFAULT NULL,
    p_email             TEXT DEFAULT NULL,
    p_category          TEXT DEFAULT NULL,
    p_notes             TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_id UUID;
    v_profile_id UUID;
BEGIN
    IF NOT public.is_org_admin_of_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'Only an organisation administrator can store credentials'
            USING ERRCODE = '42501';
    END IF;

    IF p_application_name IS NULL OR btrim(p_application_name) = '' THEN
        RAISE EXCEPTION 'Application name is required';
    END IF;
    IF p_password IS NULL OR p_password = '' THEN
        RAISE EXCEPTION 'Password is required';
    END IF;

    -- passwords.created_by references user_profiles(id), not auth.users(id).
    SELECT id INTO v_profile_id FROM user_profiles WHERE user_id = auth.uid();

    INSERT INTO passwords (
        tenant_id, application_name, url, username, email,
        password_encrypted, category, notes,
        password_changed_at, created_by, updated_by
    ) VALUES (
        p_tenant_id,
        btrim(p_application_name),
        NULLIF(btrim(COALESCE(p_url, '')), ''),
        NULLIF(btrim(COALESCE(p_username, '')), ''),
        NULLIF(btrim(COALESCE(p_email, '')), ''),
        pgp_sym_encrypt(p_password, public.password_manager_key()),
        NULLIF(btrim(COALESCE(p_category, '')), ''),
        NULLIF(p_notes, ''),
        NOW(),
        v_profile_id,
        v_profile_id
    )
    RETURNING id INTO v_id;

    INSERT INTO password_access_log (tenant_id, password_id, user_id, action)
    VALUES (p_tenant_id, v_id, auth.uid(), 'create');

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.password_create(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

/**
 * Replaces the stored secret and stamps password_changed_at.
 */
CREATE OR REPLACE FUNCTION public.password_set_secret(
    p_id       UUID,
    p_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_profile_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id
    FROM passwords WHERE id = p_id AND deleted_at IS NULL;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Credential not found';
    END IF;

    IF NOT public.is_org_admin_of_tenant(v_tenant_id) THEN
        RAISE EXCEPTION 'Only an organisation administrator can change credentials'
            USING ERRCODE = '42501';
    END IF;

    IF p_password IS NULL OR p_password = '' THEN
        RAISE EXCEPTION 'Password is required';
    END IF;

    SELECT id INTO v_profile_id FROM user_profiles WHERE user_id = auth.uid();

    UPDATE passwords
    SET password_encrypted = pgp_sym_encrypt(p_password, public.password_manager_key()),
        password_changed_at = NOW(),
        updated_by = v_profile_id,
        updated_at = NOW()
    WHERE id = p_id;

    INSERT INTO password_access_log (tenant_id, password_id, user_id, action)
    VALUES (v_tenant_id, p_id, auth.uid(), 'update');
END;
$$;

GRANT EXECUTE ON FUNCTION public.password_set_secret(UUID, TEXT) TO authenticated;

/**
 * Decrypts and returns ONE credential, and records who did it.
 *
 * This is the only route to a plaintext secret. Deliberately single-row: a
 * bulk-reveal endpoint would recreate the original problem of shipping every
 * credential to the browser at once.
 */
CREATE OR REPLACE FUNCTION public.password_reveal(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_cipher BYTEA;
    v_plain TEXT;
BEGIN
    SELECT tenant_id, password_encrypted INTO v_tenant_id, v_cipher
    FROM passwords WHERE id = p_id AND deleted_at IS NULL;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Credential not found';
    END IF;

    IF NOT public.is_org_admin_of_tenant(v_tenant_id) THEN
        RAISE EXCEPTION 'Only an organisation administrator can reveal credentials'
            USING ERRCODE = '42501';
    END IF;

    -- Log BEFORE returning, so a client that drops the response is still
    -- recorded as having requested the secret.
    INSERT INTO password_access_log (tenant_id, password_id, user_id, action)
    VALUES (v_tenant_id, p_id, auth.uid(), 'reveal');

    IF v_cipher IS NULL THEN
        RETURN NULL;
    END IF;

    v_plain := pgp_sym_decrypt(v_cipher, public.password_manager_key());
    RETURN v_plain;
END;
$$;

GRANT EXECUTE ON FUNCTION public.password_reveal(UUID) TO authenticated;

/**
 * Soft-deletes a credential and records it.
 */
CREATE OR REPLACE FUNCTION public.password_soft_delete(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_profile_id UUID;
BEGIN
    SELECT tenant_id INTO v_tenant_id
    FROM passwords WHERE id = p_id AND deleted_at IS NULL;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Credential not found';
    END IF;

    IF NOT public.is_org_admin_of_tenant(v_tenant_id) THEN
        RAISE EXCEPTION 'Only an organisation administrator can delete credentials'
            USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_profile_id FROM user_profiles WHERE user_id = auth.uid();

    UPDATE passwords
    SET deleted_at = NOW(), updated_by = v_profile_id, updated_at = NOW()
    WHERE id = p_id;

    INSERT INTO password_access_log (tenant_id, password_id, user_id, action)
    VALUES (v_tenant_id, p_id, auth.uid(), 'delete');
END;
$$;

GRANT EXECUTE ON FUNCTION public.password_soft_delete(UUID) TO authenticated;

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

-- Must return 0: no plaintext left anywhere
SELECT COUNT(*) AS rows_with_plaintext FROM passwords WHERE password IS NOT NULL;

-- Must return 0: every live credential has ciphertext
SELECT COUNT(*) AS rows_missing_ciphertext
FROM passwords
WHERE deleted_at IS NULL AND password_encrypted IS NULL;

-- `authenticated` must have no SELECT on the secret columns
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_name = 'passwords'
  AND column_name IN ('password', 'password_encrypted')
  AND grantee IN ('authenticated', 'anon');
