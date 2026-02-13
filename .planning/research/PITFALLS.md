# Domain Pitfalls: Playwright Multi-Auth Testing

**Domain:** RBAC E2E Testing
**Researched:** 2026-02-11

## Critical Pitfalls

Mistakes that cause test suite failures or security gaps.

### Pitfall 1: Session Contamination from Logout Tests

**What goes wrong:** Running logout tests with the shared `storageState` file invalidates the session, causing all subsequent tests to fail with authentication errors.

**Why it happens:** Playwright loads the storageState at context creation, but if a test performs logout, the session token in Supabase/backend becomes invalid. Other tests loading the same file get a stale/invalid token.

**Consequences:** Random test failures, flaky CI, tests pass locally but fail in CI due to execution order.

**Prevention:**
```typescript
// Create isolated context for logout tests
test('logout works', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
  })
  const page = await context.newPage()

  await page.goto('/dashboard')
  await page.click('button#logout')
  await expect(page).toHaveURL('/login')

  await context.close() // Discard context, don't modify shared file
})
```

**Detection:** Tests pass individually but fail when run together. Auth-related errors in later tests.

### Pitfall 2: Missing Environment Variables in CI

**What goes wrong:** Tests pass locally but fail in CI with "email/password undefined" errors.

**Why it happens:** Developers have `.env` with credentials locally, but CI environment doesn't have secrets configured.

**Consequences:** CI pipeline fails, blocks deployment, wastes time debugging.

**Prevention:**
```typescript
// Validate env vars at setup with clear error messages
setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL
  const password = process.env.TEST_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'Missing required environment variables. ' +
      'Ensure TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set in CI secrets.'
    )
  }
  // ...
})
```

**Detection:** Setup project fails with undefined variable errors in CI logs.

### Pitfall 3: Asserting 403 When App Redirects

**What goes wrong:** Tests expect `expect(response).not.toBeOK()` or check for 403 status, but the app redirects to `/login` or `/access-denied` instead of returning 403.

**Why it happens:** Most SPAs handle authorization client-side and redirect rather than letting the server return 403.

**Consequences:** Tests fail with "expected status 403 but got 302" or URL assertions fail.

**Prevention:**
```typescript
// Test what actually happens, not what you assume
test('forbidden access redirects', async ({ page }) => {
  await page.goto('/admin')

  // Use flexible assertion that matches actual app behavior
  await expect(page).toHaveURL(/\/(login|dashboard|access-denied)/)

  // Or check that we're NOT on the forbidden page
  await expect(page).not.toHaveURL(/\/admin/)
})
```

**Detection:** Assertion errors showing actual URL vs expected URL.

## Moderate Pitfalls

### Pitfall 1: Race Condition in URL Assertions

**What goes wrong:** `expect(page).toHaveURL('/login')` fails intermittently because the assertion runs before navigation completes.

**Prevention:**
```typescript
// Always wait for navigation before asserting
await page.waitForURL('/login', { timeout: 5000 })
await expect(page).toHaveURL('/login')
```

### Pitfall 2: StorageState File Not in .gitignore

**What goes wrong:** Auth state files with session tokens get committed to git, exposing credentials or causing merge conflicts.

**Prevention:**
```gitignore
# .gitignore
playwright/.auth/
```

### Pitfall 3: Setup Blocks Run Serially by Default

**What goes wrong:** Four auth setups take 4x as long because they run sequentially.

**Prevention:**
```typescript
// playwright.config.ts
{
  name: 'setup',
  testMatch: /.*\.setup\.ts/,
  fullyParallel: true, // Parallelize setup blocks
}
```

### Pitfall 4: Token Expiration in Long Test Suites

**What goes wrong:** StorageState created at start of suite expires before later tests run.

**Prevention:**
- Use longer-lived test tokens (configure in Supabase)
- Re-run setup between test batches
- Add token refresh logic in setup

## Minor Pitfalls

### Pitfall 1: Inconsistent Test User State

**What goes wrong:** Tests assume specific data exists (e.g., "Test Client") but it doesn't in fresh environment.

**Prevention:** Create test data in setup or use database seeding.

### Pitfall 2: Hardcoded Wait Times

**What goes wrong:** `await page.waitForTimeout(5000)` makes tests slow and still flaky.

**Prevention:** Use proper wait conditions:
```typescript
await page.waitForURL('/dashboard')
await page.waitForLoadState('networkidle')
await expect(page.getByRole('heading')).toBeVisible()
```

### Pitfall 3: Not Handling Onboarding Flow

**What goes wrong:** New test users hit onboarding flow instead of going to dashboard, breaking auth setup.

**Prevention:** Your existing setup already handles this, but document it:
```typescript
// Handle first-time users who need onboarding
if (page.url().includes('/onboarding')) {
  await page.fill('input[name="name"]', 'Test Org')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
}
```

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Multi-role setup | Env vars missing in CI | Validate at setup start |
| RBAC tests | Expecting 403 vs redirect | Test actual app behavior |
| Security tests | Session contamination | Use isolated browser contexts |
| Cross-role tests | Context cleanup | Always close contexts |
| CI integration | StorageState committed | Add to .gitignore |

## Sources

- [Playwright Solutions: Multiple Login States](https://playwrightsolutions.com/handling-multiple-login-states-between-different-tests-in-playwright/)
- [Playwright Solutions: Testing Redirects](https://playwrightsolutions.com/how-do-i-test-a-website-that-has-a-page-redirect-with-playwright/)
- [Ministry of Testing: Playwright Auth Cookbook](https://www.ministryoftesting.com/articles/simple-playwright-authentication-recipes-a-cookbook-for-software-testers)
