-- ============================================================================
-- MIGRATION: Security Hardening
-- Version: 069
-- Description: Closes a set of privilege-escalation and tenant-isolation gaps
--              found in a security review of migrations 002-068.
--
-- Contents
--   1. tenant_id immutability trigger on every tenant-scoped table
--      (fixes ~30 UPDATE policies that had USING but no WITH CHECK, which let
--       any writer move a row into another tenant)
--   2. tenant_users UPDATE: block self-promotion to sys_admin
--   3. user_profiles UPDATE: pin user_id so a profile cannot be re-pointed
--   4. SET search_path on every SECURITY DEFINER function
--   5. Revoke RLS helper functions from anon
--   6. record_login_attempt: remove the self-service bypass of the rate limiter
--   7. check_email_exists: restrict to admins (was platform-wide enumeration)
--   8. get_user_highest_role: restrict to self or admins
--   9. storage.objects UPDATE: add the missing WITH CHECK
--  10. Role checks that ignored tenant_users.status: require 'active'
--
-- AFTER RUNNING: execute supabase/refresh-schema-cache.sql in the SQL Editor.
-- ============================================================================

-- ============================================================================
-- 1. TENANT_ID IMMUTABILITY
--
-- Most UPDATE policies in this project are written as
--   FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids()))
-- with no WITH CHECK clause. Postgres then applies the USING expression to the
-- OLD row only, so an authorised writer can issue
--   update({ tenant_id: '<other tenant>' })
-- and push the row out of their own tenant into someone else's.
--
-- Rather than rewrite every policy (and risk breaking a working one), a single
-- BEFORE UPDATE trigger pins tenant_id on every table that has the column.
-- This neutralises the entire class of bug in one place and cannot be bypassed
-- by a policy that is added later.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_immutable_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claims TEXT := current_setting('request.jwt.claims', true);
BEGIN
    -- No JWT at all means this is direct SQL (a migration, a dashboard query,
    -- a cron job), not a PostgREST request. Those are already privileged.
    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN NEW;
    END IF;

    -- service_role performs legitimate administrative moves (e.g. a tenant
    -- merge run from an Edge Function), so it is exempt.
    IF (v_claims::json ->> 'role') = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            'tenant_id is immutable (attempted change from % to % on table %)',
            OLD.tenant_id, NEW.tenant_id, TG_TABLE_NAME
            USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;

    RETURN NEW;
END;
$$;

-- Attach the trigger to every base table in `public` that has a tenant_id
-- column. Idempotent: re-running simply recreates each trigger.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'tenant_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS enforce_immutable_tenant_id_trg ON public.%I',
            r.table_name
        );
        EXECUTE format(
            'CREATE TRIGGER enforce_immutable_tenant_id_trg
                 BEFORE UPDATE ON public.%I
                 FOR EACH ROW
                 EXECUTE FUNCTION public.enforce_immutable_tenant_id()',
            r.table_name
        );
        RAISE NOTICE 'tenant_id pinned on public.%', r.table_name;
    END LOOP;
END $$;

-- ============================================================================
-- 2. TENANT_USERS: BLOCK ROLE ESCALATION
--
-- Previously `tenant_users_update_v2` was FOR UPDATE with a USING clause only.
-- An org_admin could therefore run
--   update({ role: 'sys_admin' }) on their own tenant_users row
-- and gain platform-wide access to every tenant.
-- ============================================================================
DROP POLICY IF EXISTS "tenant_users_update_v2" ON tenant_users;
CREATE POLICY "tenant_users_update_v2" ON tenant_users
    FOR UPDATE
    USING (
        public.is_sys_admin()
        OR public.is_org_admin_of_tenant(tenant_id)
    )
    WITH CHECK (
        -- Only an existing sys_admin may write the sys_admin role.
        public.is_sys_admin()
        OR (
            public.is_org_admin_of_tenant(tenant_id)
            AND role <> 'sys_admin'
        )
    );

-- ============================================================================
-- 3. USER_PROFILES: PIN user_id
--
-- The UPDATE policy had no WITH CHECK, so a user could rewrite their profile's
-- user_id to point at someone else's auth account.
-- ============================================================================
DROP POLICY IF EXISTS "user_profiles_update_v2" ON user_profiles;
CREATE POLICY "user_profiles_update_v2" ON user_profiles
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR public.is_sys_admin()
        OR user_id IN (
            SELECT tu2.user_id
            FROM tenant_users tu1
            JOIN tenant_users tu2 ON tu1.tenant_id = tu2.tenant_id
            WHERE tu1.user_id = auth.uid()
              AND tu1.role = 'org_admin'
              AND tu1.status = 'active'
              AND tu2.status = 'active'
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        OR public.is_sys_admin()
        OR user_id IN (
            SELECT tu2.user_id
            FROM tenant_users tu1
            JOIN tenant_users tu2 ON tu1.tenant_id = tu2.tenant_id
            WHERE tu1.user_id = auth.uid()
              AND tu1.role = 'org_admin'
              AND tu1.status = 'active'
              AND tu2.status = 'active'
        )
    );

-- Belt and braces: user_id is never legitimately changed after creation.
CREATE OR REPLACE FUNCTION public.enforce_immutable_profile_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.user_id = OLD.user_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_immutable_profile_user_id_trg ON user_profiles;
CREATE TRIGGER enforce_immutable_profile_user_id_trg
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_immutable_profile_user_id();

-- ============================================================================
-- 4. SET search_path ON EVERY SECURITY DEFINER FUNCTION
--
-- A SECURITY DEFINER function without a pinned search_path resolves unqualified
-- names using the CALLER's search_path. Any role able to create objects in a
-- schema on that path (by default `public` is writable by all) can shadow a
-- table or operator the function uses and have it run as the definer. The RLS
-- backbone (is_sys_admin, get_user_tenant_ids, user_has_role_in_tenant,
-- is_org_admin_of_tenant) was affected, which makes this the highest-leverage
-- fix in this migration.
-- ============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = TRUE
          AND (
            p.proconfig IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) AS cfg
              WHERE cfg LIKE 'search_path=%'
            )
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.signature);
        RAISE NOTICE 'search_path pinned on %', r.signature;
    END LOOP;
END $$;

-- Remove the ability to plant shadowing objects in `public` in the first place.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

-- ============================================================================
-- 5. REVOKE RLS HELPERS FROM anon
--
-- These were granted to anon in migration 044. An unauthenticated caller has no
-- auth.uid(), so the functions return nothing useful, but there is no reason to
-- expose the tenancy model to an anonymous caller.
-- ============================================================================
DO $$
BEGIN
    REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.is_sys_admin() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.user_has_role_in_tenant(UUID, text[]) FROM anon;
EXCEPTION WHEN undefined_function OR undefined_object THEN
    RAISE NOTICE 'Some RLS helper functions were not present; skipping their revokes.';
END $$;

-- ============================================================================
-- 6. record_login_attempt: REMOVE THE RATE-LIMITER BYPASS
--
-- The function is callable by `anon` (it must be: it runs before sign-in) and
-- took `p_success` from the caller. On p_success = TRUE it DELETED the email's
-- failure history, so an attacker could simply call it with p_success = TRUE
-- between guesses and never trip the limiter.
--
-- The fix removes the DELETE entirely. Failures now age out of the window
-- naturally, which is what check_rate_limit already relies on.
-- ============================================================================
CREATE OR REPLACE FUNCTION record_login_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO login_attempts (
        email, ip_address, user_agent, success, error_message, attempted_at
    ) VALUES (
        LOWER(LEFT(p_email, 254)),
        NULLIF(p_ip_address, '')::INET,
        LEFT(p_user_agent, 400),
        p_success,
        LEFT(p_error_message, 500),
        NOW()
    );

    -- DELIBERATELY NO DELETE HERE.
    -- Clearing failures on a client-asserted success made the limiter a no-op.
END;
$$;

COMMENT ON FUNCTION record_login_attempt(TEXT, BOOLEAN, TEXT, TEXT, TEXT) IS
  'Appends a login attempt. Never clears history: the previous version deleted failures on a client-supplied p_success=true, which bypassed the rate limiter entirely.';

-- ============================================================================
-- 7. check_email_exists: STOP PLATFORM-WIDE ACCOUNT ENUMERATION
--
-- Any authenticated user could probe whether an arbitrary email had an account
-- anywhere on the platform. Only admins actually need this (it backs the
-- "invite user" flow), so gate it.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
    END IF;

    -- Only users who can actually invite somebody may probe for an address.
    IF NOT (
        public.is_sys_admin()
        OR EXISTS (
            SELECT 1 FROM tenant_users
            WHERE user_id = auth.uid()
              AND role = 'org_admin'
              AND status = 'active'
        )
    ) THEN
        RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_email_exists(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_email_exists(TEXT) IS
  'Returns true if the email has an account. Restricted to org_admin and sys_admin to prevent account enumeration.';

-- ============================================================================
-- 8. get_user_highest_role: RESTRICT TO SELF OR ADMINS
--
-- The function took an arbitrary p_user_id with no caller check, so any
-- authenticated user could read any other user's role.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_highest_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- Callers may ask about themselves, or about a user who shares a tenant with
  -- them when they administer that tenant.
  IF p_user_id <> auth.uid()
     AND NOT public.is_sys_admin()
     AND NOT EXISTS (
        SELECT 1
        FROM tenant_users me
        JOIN tenant_users them ON me.tenant_id = them.tenant_id
        WHERE me.user_id = auth.uid()
          AND me.role = 'org_admin'
          AND me.status = 'active'
          AND them.user_id = p_user_id
     ) THEN
      RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM tenant_users
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY
    CASE role
      WHEN 'sys_admin' THEN 1
      WHEN 'org_admin' THEN 2
      WHEN 'org_user'  THEN 3
      WHEN 'client_user' THEN 4
      ELSE 5
    END
  LIMIT 1;

  RETURN v_role;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_user_highest_role(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_user_highest_role(UUID) TO authenticated, service_role;

-- ============================================================================
-- 9. STORAGE: ADD THE MISSING WITH CHECK
--
-- `tenant_update_policy` from migration 029 validated the tenant path in USING
-- only. A user could therefore UPDATE storage.objects and rewrite `name` into
-- another tenant's prefix, handing themselves a file in that tenant's folder.
-- ============================================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "tenant_update_policy" ON storage.objects;

    CREATE POLICY "tenant_update_policy" ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (
            bucket_id = 'documents'
            AND public.validate_storage_tenant_path(name)
        )
        WITH CHECK (
            bucket_id = 'documents'
            AND public.validate_storage_tenant_path(name)
        );
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not alter storage.objects policies from this role. Apply section 9 from the Supabase SQL Editor as the owner.';
END $$;

-- ============================================================================
-- 10. ROLE CHECKS THAT IGNORED tenant_users.status
--
-- Several policies matched on `role` without requiring `status = 'active'`, so
-- a suspended or removed member kept their access. `is_sys_admin()` already
-- checks status, so routing these through the helper fixes them and keeps the
-- rule in one place.
-- ============================================================================
DO $$
BEGIN
    DROP POLICY IF EXISTS "sys_admin_full_access" ON support_tickets;
    CREATE POLICY "sys_admin_full_access" ON support_tickets
        FOR ALL
        TO authenticated
        USING (public.is_sys_admin())
        WITH CHECK (public.is_sys_admin());
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'support_tickets not present; skipping.';
END $$;

-- ============================================================================
-- 11. STORAGE BUCKET LIMITS
--
-- The `documents` bucket had no size cap and no MIME allowlist, so any
-- authenticated user could upload an arbitrarily large file of any type into
-- their tenant folder. These limits are enforced by Storage itself, so they
-- also apply to callers that bypass the app's own client-side validation.
-- ============================================================================
DO $$
BEGIN
    UPDATE storage.buckets
    SET
      public = FALSE,
      file_size_limit = 52428800,  -- 50 MB, matching the client-side cap
      allowed_mime_types = ARRAY[
        'application/pdf',
        'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic',
        'text/plain', 'text/csv', 'text/markdown',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/rtf',
        'application/zip',
        'application/octet-stream'
      ]
    WHERE id = 'documents';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Could not update storage.buckets from this role. Set the size limit and MIME allowlist on the `documents` bucket in the Supabase dashboard.';
END $$;

-- ============================================================================
-- 12. VERIFICATION
-- ============================================================================

-- Any remaining SECURITY DEFINER function without a pinned search_path
SELECT p.oid::regprocedure AS unpinned_security_definer_function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

-- Any remaining UPDATE policy with no WITH CHECK. These are now covered by the
-- tenant_id trigger for cross-tenant moves, but any that also permit changing a
-- role or ownership column should be reviewed.
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE cmd = 'UPDATE'
  AND with_check IS NULL
  AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Tables that carry tenant_id but did not receive the immutability trigger
SELECT c.relname AS table_missing_tenant_id_trigger
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT a.attisdropped
  AND NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = c.oid
      AND t.tgname = 'enforce_immutable_tenant_id_trg'
  );

-- Policies that match on tenant_users.role WITHOUT requiring status = 'active'.
-- A suspended or removed member keeps the access these grant. The worst case
-- (the global sys_admin policy on support_tickets) is fixed in section 10
-- above; the rows this returns are within-tenant and are tracked as follow-up
-- work. Rewriting them to call public.user_has_role_in_tenant(), which is
-- status-aware, is the fix.
SELECT
  tablename,
  policyname,
  cmd,
  'matches role without status = active' AS issue
FROM pg_policies
WHERE schemaname = 'public'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%tenant_users%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%role%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%status%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%is_sys_admin%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%user_has_role_in_tenant%'
  AND (COALESCE(qual, '') || COALESCE(with_check, '')) NOT LIKE '%get_user_tenant_ids%'
ORDER BY tablename, policyname;
