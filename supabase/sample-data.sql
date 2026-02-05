-- LineUp Sample Data Setup
-- ====================================================
--
-- IMPORTANT: Run fix-rls-tenant-users.sql FIRST to fix RLS policies!
--
-- STEP 1: Create test users in Supabase Dashboard
-- Go to: Supabase Dashboard > Authentication > Users > Add User
--
-- Create these 3 users with "Auto Confirm User" checked:
--
-- 1. SYSTEM ADMIN (sys_admin) - Can access /admin portal
--    Email: sysadmin@lineup.app
--    Password: SysAdmin123!
--
-- 2. SYSTEM TESTER (sys_admin for testing)
--    Email: systester@lineup.app
--    Password: SysTester123!
--
-- 3. ORG ADMIN (org_admin for OneSquad tenant)
--    Email: orgadmin@onesquad.com
--    Password: OrgAdmin123!
--
-- ====================================================
-- STEP 2: Create the OneSquad tenant
-- ====================================================

INSERT INTO tenants (id, name, slug, status, plan_tier)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'OneSquad',
    'onesquad',
    'active',
    'professional'
)
ON CONFLICT (slug) DO UPDATE SET name = 'OneSquad', status = 'active';

-- ====================================================
-- STEP 3: Check users exist and get their IDs
-- ====================================================

SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- ====================================================
-- STEP 4: Create user profiles (run after users are created)
-- ====================================================

-- SysAdmin profile
INSERT INTO user_profiles (user_id, full_name)
SELECT id, 'System Administrator'
FROM auth.users WHERE email = 'sysadmin@lineup.app'
ON CONFLICT (user_id) DO UPDATE SET full_name = 'System Administrator';

-- SysTester profile
INSERT INTO user_profiles (user_id, full_name)
SELECT id, 'System Tester'
FROM auth.users WHERE email = 'systester@lineup.app'
ON CONFLICT (user_id) DO UPDATE SET full_name = 'System Tester';

-- OrgAdmin profile
INSERT INTO user_profiles (user_id, full_name)
SELECT id, 'Organization Admin'
FROM auth.users WHERE email = 'orgadmin@onesquad.com'
ON CONFLICT (user_id) DO UPDATE SET full_name = 'Organization Admin';

-- ====================================================
-- STEP 5: Link users to tenant with roles
-- ====================================================

-- SysAdmin - sys_admin role in OneSquad (gives them admin portal access)
INSERT INTO tenant_users (tenant_id, user_id, role, status)
SELECT
    'a0000000-0000-0000-0000-000000000001',
    id,
    'sys_admin',
    'active'
FROM auth.users WHERE email = 'sysadmin@lineup.app'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'sys_admin', status = 'active';

-- SysTester - sys_admin role (for testing admin functionality)
INSERT INTO tenant_users (tenant_id, user_id, role, status)
SELECT
    'a0000000-0000-0000-0000-000000000001',
    id,
    'sys_admin',
    'active'
FROM auth.users WHERE email = 'systester@lineup.app'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'sys_admin', status = 'active';

-- OrgAdmin - org_admin role (manages OneSquad tenant)
INSERT INTO tenant_users (tenant_id, user_id, role, status)
SELECT
    'a0000000-0000-0000-0000-000000000001',
    id,
    'org_admin',
    'active'
FROM auth.users WHERE email = 'orgadmin@onesquad.com'
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'org_admin', status = 'active';

-- ====================================================
-- STEP 6: Verify the setup
-- ====================================================

-- Check tenants
SELECT id, name, slug, status FROM tenants;

-- Check users, profiles, and roles
SELECT
    au.email,
    up.full_name,
    tu.role,
    t.name as tenant_name,
    tu.status
FROM auth.users au
LEFT JOIN user_profiles up ON up.user_id = au.id
LEFT JOIN tenant_users tu ON tu.user_id = au.id
LEFT JOIN tenants t ON t.id = tu.tenant_id
ORDER BY au.email;

-- ====================================================
-- LOGIN CREDENTIALS SUMMARY:
-- ====================================================
--
-- SYSTEM ADMIN (Access: /admin portal)
--   Email: sysadmin@lineup.app
--   Password: SysAdmin123!
--   Role: sys_admin
--
-- SYSTEM TESTER (Access: /admin portal)
--   Email: systester@lineup.app
--   Password: SysTester123!
--   Role: sys_admin
--
-- ORG ADMIN (Access: /dashboard - OneSquad)
--   Email: orgadmin@onesquad.com
--   Password: OrgAdmin123!
--   Role: org_admin
--
-- ====================================================
