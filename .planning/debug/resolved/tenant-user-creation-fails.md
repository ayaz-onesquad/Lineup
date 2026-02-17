---
status: resolved
trigger: "OrgAdmin cannot add new tenant users from Team page - User already exists error even for brand new emails"
created: 2026-02-17T00:00:00Z
updated: 2026-02-17T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED - adminCreateUser used supabase.auth.signUp() (client-side session-switching API) instead of the admin API
test: Traced full code path, replaced with Edge Function using service_role key
expecting: User creation no longer affects admin session; no partial-creation state; no false "already exists" errors
next_action: COMPLETE

## Symptoms

expected: User should be created in auth.users AND linked to tenant in tenant_users table, then appear in Team list
actual: Error message "User already exists" shown in UI
errors: "A user with this email already exists" - shown even for brand new email addresses that definitely don't exist
reproduction: Go to Settings > Team page as OrgAdmin, click "Create User", fill in form with new email, submit
started: This feature has NEVER worked correctly

## Eliminated

- hypothesis: check_email_exists RPC SQL is buggy
  evidence: SQL is correct (LOWER() comparison against auth.users with SECURITY DEFINER). Migrations 035/036 are confirmed applied remotely.
  timestamp: 2026-02-17T00:01:00Z

- hypothesis: debounce logic in TeamPage has a race condition
  evidence: Code correctly clears pending timeout, resets state on invalid email, and catches errors
  timestamp: 2026-02-17T00:01:00Z

## Evidence

- timestamp: 2026-02-17T00:01:00Z
  checked: auth.ts adminCreateUser() lines 263-365
  found: Uses supabase.auth.signUp() from the browser client. When email confirmation is disabled (common in dev/staging), signUp() auto-logs-in as the new user, switching the current session away from admin.
  implication: The admin session gets lost. setSession() with stored tokens is fragile because Supabase may have rotated the refresh token via background auto-refresh during the signUp() call.

- timestamp: 2026-02-17T00:01:00Z
  checked: adminCreateUser catch block (lines 353-364)
  found: On any failure after signUp() succeeds, the function rethrows. The NEW USER now exists in auth.users but was never added to tenant_users.
  implication: On retry, checkEmailExists correctly finds the email in auth.users and returns true, showing inline "User already exists" error. This is why "it has never worked" - the first attempt partially fails, and retrying blocks on inline validation.

- timestamp: 2026-02-17T00:01:00Z
  checked: supabase.auth.signUp() behavior vs supabase.auth.admin.createUser()
  found: signUp() is a CLIENT-SIDE function that manages the current user session. supabase.auth.admin.createUser() is the correct admin API, but requires the service_role key which can only exist server-side. The existing admin-reset-password Edge Function already demonstrates this exact pattern.
  implication: The fix is an Edge Function that uses the service_role key to call auth.admin.createUser() - which does NOT affect any browser session.

## Resolution

root_cause: adminCreateUser() in auth.ts used supabase.auth.signUp() - a client-side session-switching operation. The call creates the new user but also replaces the admin's browser session with the new user's session. The subsequent setSession() attempt to restore admin tokens is unreliable because Supabase rotates refresh tokens on new session creation. When any step fails after signUp() succeeds, the user is partially created in auth.users but not in tenant_users. On retry, checkEmailExists correctly returns true, blocking with "User already exists" inline error. This created an unrecoverable loop on the very first attempt, which is why the feature has never worked.

fix: Replaced adminCreateUser() with an Edge Function call (admin-create-user). The Edge Function uses supabase.auth.admin.createUser() with the service_role key server-side. This creates users without touching any browser session. Also removed the now-unnecessary session save/restore/verify block from tenants.ts createUser().

verification: TypeScript compiled with zero errors. Edge Function deployed successfully to project zsrtcthepydfxgruagvq.

files_changed:
  - supabase/functions/admin-create-user/index.ts (created - new Edge Function)
  - src/services/api/auth.ts (replaced adminCreateUser implementation - removed signUp() session dance, added Edge Function fetch)
  - src/services/api/tenants.ts (removed session restoration block from createUser, removed stale adminUserId reference)
