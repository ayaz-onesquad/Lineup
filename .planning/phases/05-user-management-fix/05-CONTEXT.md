# Phase 5: User Management Fix

## Priority: CRITICAL

## Problem Statement

User creation is broken for both OrgAdmin and SysAdmin roles. When attempting to create users via TeamPage (`/settings/team`) or AdminTenantDetailPage (`/admin/tenants/:id`), the operation fails or produces inconsistent results due to:

1. **RLS Policy Conflicts** - Migration 018 and 025 create conflicting policies
2. **Session Hijacking** - `supabase.auth.signUp()` auto-logs in as new user, replacing admin session
3. **Missing Validation** - No pre-flight checks for tenant context
4. **Partial Failure Handling** - User can be created in auth but fail to add to tenant_users

## Root Cause Analysis

### Issue 1: RLS Policy Conflicts

Migration 018 creates:
```sql
CREATE POLICY "user_profiles_insert_policy" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_sys_admin());
```

Migration 025 drops and recreates with different logic:
```sql
CREATE POLICY "user_profiles_insert_policy" ON user_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR public.is_sys_admin()
        OR public.is_org_admin()
    );
```

If migrations aren't applied cleanly, OrgAdmin INSERT fails.

### Issue 2: Session Restoration Not Verified

In `auth.ts`, `adminCreateUser()` does:
1. Save admin session
2. Call `supabase.auth.signUp()` (which swaps session)
3. Restore admin session

But `tenantsApi.createUser()` doesn't verify the session was actually restored before doing the `tenant_users` INSERT.

### Issue 3: Missing Pre-Flight Validation

TeamPage.tsx does:
```typescript
tenantsApi.createUser(currentTenantId!, { ... })
```

The `!` force-unwrap will crash if `currentTenantId` is null, with an unhelpful error.

### Issue 4: Orphaned Users

If user is created in `auth.users` but `tenant_users` INSERT fails, the user exists but can't access anything.

## Success Criteria

1. OrgAdmin can create org_user and client_user in their tenant
2. SysAdmin can create any role in any tenant
3. Newly created users appear immediately in the team list
4. Session is never hijacked (admin stays logged in)
5. Clear error messages for all failure modes
6. No orphaned users on partial failure

## Files to Modify

### Database
- `supabase/migrations/031_fix_user_creation_rls.sql` (new)

### Services
- `src/services/api/auth.ts` - Add session verification
- `src/services/api/tenants.ts` - Add rollback on partial failure

### Pages
- `src/pages/settings/TeamPage.tsx` - Add validation, improve error handling
- `src/pages/admin/AdminTenantDetailPage.tsx` - Same fixes

## Test Plan

1. OrgAdmin creates org_user - should succeed
2. OrgAdmin creates client_user - should succeed
3. SysAdmin creates org_admin in tenant - should succeed
4. Create user with invalid email - should show validation error
5. Network failure during creation - should rollback cleanly
6. Admin session persists after user creation
