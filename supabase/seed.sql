-- Seed script for Closed-Loop User Model testing
-- Creates 3 test users: 1 SysAdmin, 1 OrgAdmin (Tenant A), 1 OrgUser (Tenant A)
--
-- IMPORTANT: This script must be run AFTER creating auth users via Supabase Dashboard or CLI
--
-- To create the auth users, run these commands in order:
--
-- 1. Create auth users via Supabase CLI or Dashboard:
--    - sysadmin@test.lineup.dev / TestPassword123!
--    - orgadmin@test.lineup.dev / TestPassword123!
--    - orguser@test.lineup.dev / TestPassword123!
--
-- 2. Then run this seed script to set up profiles and tenant associations

-- ============================================================================
-- Test Configuration
-- ============================================================================
-- These UUIDs will be replaced with actual user IDs after auth user creation
-- For local development, you can use fixed UUIDs

DO $$
DECLARE
    v_sysadmin_id UUID;
    v_orgadmin_id UUID;
    v_orguser_id UUID;
    v_tenant_id UUID;
BEGIN
    -- ============================================================================
    -- Step 1: Get or create test users from auth.users
    -- Note: These users must already exist in auth.users (created via Supabase auth)
    -- ============================================================================

    -- Try to find existing test users by email
    SELECT id INTO v_sysadmin_id FROM auth.users WHERE email = 'sysadmin@test.lineup.dev';
    SELECT id INTO v_orgadmin_id FROM auth.users WHERE email = 'orgadmin@test.lineup.dev';
    SELECT id INTO v_orguser_id FROM auth.users WHERE email = 'orguser@test.lineup.dev';

    -- If users don't exist, raise notice (they need to be created via Supabase auth first)
    IF v_sysadmin_id IS NULL THEN
        RAISE NOTICE 'SysAdmin user not found. Create via Supabase auth first: sysadmin@test.lineup.dev';
        RETURN;
    END IF;

    IF v_orgadmin_id IS NULL THEN
        RAISE NOTICE 'OrgAdmin user not found. Create via Supabase auth first: orgadmin@test.lineup.dev';
        RETURN;
    END IF;

    IF v_orguser_id IS NULL THEN
        RAISE NOTICE 'OrgUser user not found. Create via Supabase auth first: orguser@test.lineup.dev';
        RETURN;
    END IF;

    -- ============================================================================
    -- Step 2: Create Test Tenant
    -- ============================================================================
    INSERT INTO tenants (name, slug, status, plan_tier)
    VALUES ('Test Tenant A', 'test-tenant-a', 'active', 'professional')
    ON CONFLICT (slug) DO UPDATE SET name = 'Test Tenant A'
    RETURNING id INTO v_tenant_id;

    RAISE NOTICE 'Created/updated tenant: % (ID: %)', 'Test Tenant A', v_tenant_id;

    -- ============================================================================
    -- Step 3: Create User Profiles
    -- ============================================================================
    INSERT INTO user_profiles (user_id, full_name)
    VALUES
        (v_sysadmin_id, 'Test SysAdmin'),
        (v_orgadmin_id, 'Test OrgAdmin'),
        (v_orguser_id, 'Test OrgUser')
    ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name;

    RAISE NOTICE 'Created/updated user profiles';

    -- ============================================================================
    -- Step 4: Create Tenant User Associations
    -- ============================================================================

    -- SysAdmin - global role, associated with a "system" tenant or any tenant
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (v_tenant_id, v_sysadmin_id, 'sys_admin', 'active')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'sys_admin', status = 'active';

    -- OrgAdmin - admin of Tenant A
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (v_tenant_id, v_orgadmin_id, 'org_admin', 'active')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'org_admin', status = 'active';

    -- OrgUser - regular user in Tenant A
    INSERT INTO tenant_users (tenant_id, user_id, role, status)
    VALUES (v_tenant_id, v_orguser_id, 'org_user', 'active')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'org_user', status = 'active';

    RAISE NOTICE 'Created/updated tenant_users associations';

    -- ============================================================================
    -- Summary
    -- ============================================================================
    RAISE NOTICE '';
    RAISE NOTICE '=== Seed Complete ===';
    RAISE NOTICE 'Tenant: Test Tenant A (ID: %)', v_tenant_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Users:';
    RAISE NOTICE '  1. SysAdmin: sysadmin@test.lineup.dev (ID: %)', v_sysadmin_id;
    RAISE NOTICE '  2. OrgAdmin: orgadmin@test.lineup.dev (ID: %)', v_orgadmin_id;
    RAISE NOTICE '  3. OrgUser: orguser@test.lineup.dev (ID: %)', v_orguser_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Password for all: TestPassword123!';

END $$;

-- ============================================================================
-- Verification Query (run after seeding)
-- ============================================================================
-- SELECT
--     u.email,
--     up.full_name,
--     tu.role,
--     tu.status,
--     t.name as tenant_name
-- FROM auth.users u
-- LEFT JOIN user_profiles up ON up.user_id = u.id
-- LEFT JOIN tenant_users tu ON tu.user_id = u.id
-- LEFT JOIN tenants t ON t.id = tu.tenant_id
-- WHERE u.email LIKE '%test.lineup.dev'
-- ORDER BY
--     CASE tu.role
--         WHEN 'sys_admin' THEN 1
--         WHEN 'org_admin' THEN 2
--         WHEN 'org_user' THEN 3
--     END;
