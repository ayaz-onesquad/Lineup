# Research Summary: Playwright Multi-Auth Testing for RBAC

**Domain:** End-to-end testing with multiple authentication states
**Researched:** 2026-02-11
**Overall confidence:** HIGH

## Executive Summary

Playwright provides robust support for testing role-based access control (RBAC) through its **setup projects** and **storageState** mechanisms. The recommended architecture uses separate setup files that authenticate different user roles (e.g., `sys_admin`, `org_admin`, `org_user`, `client_user`) and save their session states to distinct JSON files. Test projects then depend on the setup project and load the appropriate auth state.

For LineUp's four-role system (`sys_admin`, `org_admin`, `org_user`, `client_user`), the optimal pattern involves:
1. A single `auth.setup.ts` file with multiple setup blocks (one per role)
2. Separate storage state files: `playwright/.auth/sysadmin.json`, `admin.json`, `user.json`, `client.json`
3. Distinct test projects in `playwright.config.ts` that specify which storageState to use
4. Role-specific test files that verify both allowed and forbidden access patterns

Testing 403 Forbidden states requires either intercepting API responses via `page.route()` or navigating to protected routes and asserting the redirect to login/access-denied pages. Playwright's `expect(page).toHaveURL()` and `page.waitForURL()` methods handle redirect assertions reliably.

## Key Findings

**Stack:** Playwright's native auth support with `storageState` and project dependencies
**Architecture:** Separate auth files per role, setup project runs first, test projects depend on setup
**Critical pitfall:** Session contamination across tests if logout actions modify shared auth state files

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Auth Setup Infrastructure** - Create multi-role auth setup and project configuration
   - Addresses: Environment variables for each role's credentials
   - Avoids: Single auth file for all tests (inflexible)

2. **RBAC Positive Tests** - Verify each role CAN access their permitted pages
   - Addresses: Confirming navigation works with authenticated state
   - Avoids: Testing only unauthenticated flows

3. **RBAC Negative Tests** - Verify roles CANNOT access forbidden pages
   - Addresses: Security assertions, redirect verification
   - Avoids: Assuming 403 responses (most apps redirect instead)

4. **API Response Interception** - Mock server errors for edge case testing
   - Addresses: Testing how UI handles 401/403 API responses
   - Avoids: Relying on server-side errors only

**Phase ordering rationale:**
- Auth setup must exist before any authenticated tests run
- Positive tests (can access) should pass before negative tests (cannot access)
- API interception is optional enhancement after basic flows work

**Research flags for phases:**
- Phase 3: Needs careful design of redirect assertions vs 403 response checks
- Phase 4: Standard patterns, uses documented `page.route()` API

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Multi-auth setup | HIGH | Official Playwright docs provide exact patterns |
| Project dependencies | HIGH | Well-documented feature |
| Redirect assertions | HIGH | `waitForURL` and `toHaveURL` are reliable |
| 403 response testing | MEDIUM | May need route interception if app redirects instead |

## Gaps to Address

- LineUp-specific role credential management (need env vars per role)
- Determining if LineUp returns 403 or redirects for unauthorized access
- Handling token expiration in long test suites

## Sources

- [Playwright Authentication Documentation](https://playwright.dev/docs/auth)
- [Playwright Solutions: Multiple Login States](https://playwrightsolutions.com/handling-multiple-login-states-between-different-tests-in-playwright/)
- [Playwright Solutions: Testing Redirects](https://playwrightsolutions.com/how-do-i-test-a-website-that-has-a-page-redirect-with-playwright/)
- [BrowserStack: Playwright waitForResponse](https://www.browserstack.com/guide/playwright-waitforresponse)
- [TestLeaf: Playwright Storage State](https://www.testleaf.com/blog/playwright-storage-state-reuse-login-multiple-users/)
