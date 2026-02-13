# Architecture Patterns: Playwright Multi-Auth Testing

**Domain:** RBAC E2E Testing
**Researched:** 2026-02-11

## Recommended Architecture

```
playwright.config.ts
        |
        v
+------------------+
|  Setup Project   |  (runs first, fullyParallel: true)
|  auth.setup.ts   |
+------------------+
        |
        | generates
        v
+------------------------------------------+
|  playwright/.auth/                        |
|    sysadmin.json                         |
|    admin.json                            |
|    user.json                             |
|    client.json                           |
+------------------------------------------+
        |
        | consumed by (via dependencies)
        v
+------------------+  +------------------+  +------------------+  +------------------+
| sysadmin-tests   |  | admin-tests      |  | user-tests       |  | client-tests     |
| storageState:    |  | storageState:    |  | storageState:    |  | storageState:    |
| sysadmin.json    |  | admin.json       |  | user.json        |  | client.json      |
+------------------+  +------------------+  +------------------+  +------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `auth.setup.ts` | Authenticate all roles, save storageState | Login page, Supabase Auth |
| `playwright.config.ts` | Define projects, dependencies, storageState paths | All test files |
| Role test files | Test role-specific functionality | App pages via storageState |
| Security test files | Test forbidden access, redirects | Multiple storageStates |

### Data Flow

1. **CI triggers test run** -> Playwright loads config
2. **Setup project runs first** -> Each setup block authenticates a role
3. **storageState files saved** -> JSON contains cookies, localStorage, sessionStorage
4. **Test projects run in parallel** -> Each loads its designated storageState
5. **Tests navigate directly** -> No login required, session pre-populated

## Patterns to Follow

### Pattern 1: Multi-Role Auth Setup

**What:** Single `auth.setup.ts` with multiple `setup()` blocks
**When:** Always use for multi-role applications
**Example:**

```typescript
// tests/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const ROLES = {
  sysadmin: {
    email: process.env.TEST_SYSADMIN_EMAIL!,
    password: process.env.TEST_SYSADMIN_PASSWORD!,
    authFile: 'playwright/.auth/sysadmin.json',
    expectedUrl: '/admin',
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL!,
    password: process.env.TEST_ADMIN_PASSWORD!,
    authFile: 'playwright/.auth/admin.json',
    expectedUrl: '/dashboard',
  },
  user: {
    email: process.env.TEST_USER_EMAIL!,
    password: process.env.TEST_USER_PASSWORD!,
    authFile: 'playwright/.auth/user.json',
    expectedUrl: '/dashboard',
  },
  client: {
    email: process.env.TEST_CLIENT_EMAIL!,
    password: process.env.TEST_CLIENT_PASSWORD!,
    authFile: 'playwright/.auth/client.json',
    expectedUrl: '/portal',
  },
}

setup('authenticate as sys_admin', async ({ page }) => {
  const { email, password, authFile, expectedUrl } = ROLES.sysadmin

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL(expectedUrl)
  await page.context().storageState({ path: authFile })
})

setup('authenticate as org_admin', async ({ page }) => {
  const { email, password, authFile, expectedUrl } = ROLES.admin

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL(expectedUrl)
  await page.context().storageState({ path: authFile })
})

setup('authenticate as org_user', async ({ page }) => {
  const { email, password, authFile, expectedUrl } = ROLES.user

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL(expectedUrl)
  await page.context().storageState({ path: authFile })
})

setup('authenticate as client_user', async ({ page }) => {
  const { email, password, authFile, expectedUrl } = ROLES.client

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL(expectedUrl)
  await page.context().storageState({ path: authFile })
})
```

### Pattern 2: Project Configuration with Dependencies

**What:** Separate test projects per role with shared setup dependency
**When:** Need parallel execution and role isolation
**Example:**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    // Setup project - runs auth.setup.ts first (parallel setup blocks)
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      fullyParallel: true, // Run all setup blocks in parallel
    },

    // SysAdmin tests - uses sysadmin auth state
    {
      name: 'sysadmin-tests',
      testDir: './tests/sysadmin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/sysadmin.json',
      },
      dependencies: ['setup'],
    },

    // OrgAdmin tests - uses admin auth state
    {
      name: 'admin-tests',
      testDir: './tests/org-admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // OrgUser tests - uses user auth state
    {
      name: 'user-tests',
      testDir: './tests/org-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ClientUser tests - uses client auth state
    {
      name: 'client-tests',
      testDir: './tests/client-user',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/client.json',
      },
      dependencies: ['setup'],
    },

    // Security tests - may use multiple auth states
    {
      name: 'security-tests',
      testDir: './tests/security',
      use: {
        ...devices['Desktop Chrome'],
        // No default storageState - tests specify per-file
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### Pattern 3: RBAC Security Tests (Forbidden Access)

**What:** Verify users cannot access pages outside their role
**When:** Testing authorization boundaries
**Example:**

```typescript
// tests/security/rbac-forbidden.spec.ts
import { test, expect } from '@playwright/test'

test.describe('SysAdmin pages are forbidden to other roles', () => {
  // Use org_user auth - should NOT have access to /admin
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('org_user cannot access /admin dashboard', async ({ page }) => {
    await page.goto('/admin')

    // Option A: App redirects to login or access-denied
    await expect(page).toHaveURL(/\/(login|access-denied|dashboard)/)

    // Option B: Assert specific redirect
    // await page.waitForURL('/dashboard')
    // const url = page.url()
    // expect(url).not.toContain('/admin')
  })

  test('org_user cannot access tenant management', async ({ page }) => {
    await page.goto('/admin/tenants')

    // Should be redirected away from admin
    await expect(page).not.toHaveURL(/\/admin/)
  })
})

test.describe('Client pages are forbidden to org_users', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('org_user cannot access client portal', async ({ page }) => {
    await page.goto('/portal')

    // Should redirect to dashboard or show forbidden
    await expect(page).not.toHaveURL(/\/portal/)
  })
})

test.describe('Dashboard forbidden to unauthenticated', () => {
  // Reset auth state - no authentication
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user redirects to login', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to login
    await page.waitForURL('/login')
    await expect(page).toHaveURL('/login')
  })

  test('unauthenticated cannot access admin', async ({ page }) => {
    await page.goto('/admin')

    await page.waitForURL('/login')
    await expect(page).toHaveURL('/login')
  })
})
```

### Pattern 4: API Response Interception (403 Testing)

**What:** Mock 403 responses to test UI error handling
**When:** Testing how UI handles authorization failures from API
**Example:**

```typescript
// tests/security/api-forbidden.spec.ts
import { test, expect } from '@playwright/test'

test.describe('API 403 response handling', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('displays error when API returns 403', async ({ page }) => {
    // Intercept API calls and return 403
    await page.route('**/rest/v1/tenants**', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource'
        }),
      })
    })

    // Navigate to a page that would fetch tenants
    await page.goto('/admin/tenants')

    // Assert error state is displayed
    await expect(page.getByText(/forbidden|permission denied/i)).toBeVisible()
  })

  test('handles 401 unauthorized gracefully', async ({ page }) => {
    // Intercept API calls and return 401
    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Session expired'
        }),
      })
    })

    await page.goto('/dashboard')

    // Should redirect to login after 401
    await expect(page).toHaveURL(/\/login/)
  })
})
```

### Pattern 5: Multiple Roles in Single Test

**What:** Test interactions between different authenticated users
**When:** Testing workflows involving multiple roles (e.g., admin approves user request)
**Example:**

```typescript
// tests/cross-role/admin-user-interaction.spec.ts
import { test, expect, Browser } from '@playwright/test'

test('admin can see user-created content', async ({ browser }) => {
  // Create context for org_user
  const userContext = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
  })
  const userPage = await userContext.newPage()

  // User creates a requirement
  await userPage.goto('/requirements')
  await userPage.getByRole('button', { name: 'Create' }).click()
  await userPage.fill('input[name="title"]', 'Test Requirement from User')
  await userPage.getByRole('button', { name: 'Save' }).click()
  await userPage.waitForURL(/\/requirements\//)

  // Create context for org_admin
  const adminContext = await browser.newContext({
    storageState: 'playwright/.auth/admin.json',
  })
  const adminPage = await adminContext.newPage()

  // Admin should see the user-created requirement
  await adminPage.goto('/requirements')
  await expect(adminPage.getByText('Test Requirement from User')).toBeVisible()

  // Cleanup
  await userContext.close()
  await adminContext.close()
})
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Modifying Shared Auth State

**What:** Running logout tests that corrupt the shared storageState file
**Why bad:** Other tests fail because auth state is invalid
**Instead:** Create temporary auth state for logout tests

```typescript
// BAD - corrupts shared auth state
test('logout works', async ({ page }) => {
  test.use({ storageState: 'playwright/.auth/user.json' })
  await page.goto('/dashboard')
  await page.click('button#logout') // This invalidates the stored session!
})

// GOOD - use fresh browser context
test('logout works', async ({ browser }) => {
  // Create fresh context with auth state
  const context = await browser.newContext({
    storageState: 'playwright/.auth/user.json',
  })
  const page = await context.newPage()

  await page.goto('/dashboard')
  await page.click('button#logout')
  await expect(page).toHaveURL('/login')

  // Context is discarded, original auth file unchanged
  await context.close()
})
```

### Anti-Pattern 2: Hardcoding Credentials

**What:** Credentials directly in test files
**Why bad:** Security risk, hard to rotate, fails in CI
**Instead:** Use environment variables with validation

```typescript
// BAD
setup('auth', async ({ page }) => {
  await page.getByLabel('Email').fill('admin@company.com')
  await page.getByLabel('Password').fill('SuperSecret123!')
})

// GOOD
setup('auth', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL
  const password = process.env.TEST_ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set')
  }

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
})
```

### Anti-Pattern 3: Race Condition in Redirect Assertions

**What:** Asserting URL before navigation completes
**Why bad:** Flaky tests that sometimes pass, sometimes fail
**Instead:** Use `waitForURL` before `toHaveURL`

```typescript
// BAD - race condition
test('redirects on forbidden', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL('/login') // May fail if redirect is slow
})

// GOOD - wait for navigation
test('redirects on forbidden', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForURL('/login', { timeout: 5000 })
  await expect(page).toHaveURL('/login')
})
```

## Scalability Considerations

| Concern | 10 tests | 100 tests | 1000 tests |
|---------|----------|-----------|------------|
| Auth setup time | Once per role (4x) | Once per role (4x) | Once per role (4x) |
| Parallel execution | Full parallel | Split by project | Shard across CI |
| StorageState files | 4 files | 4 files | 4 files |
| CI resources | Single runner | Multiple workers | Multiple machines |

## Sources

- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright Solutions: Multiple Login States](https://playwrightsolutions.com/handling-multiple-login-states-between-different-tests-in-playwright/)
- [Playwright Solutions: Testing Redirects](https://playwrightsolutions.com/how-do-i-test-a-website-that-has-a-page-redirect-with-playwright/)
- [BrowserStack: Playwright Storage State](https://www.browserstack.com/guide/playwright-storage-state)
