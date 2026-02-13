import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Auth state file paths
const adminAuthFile = path.join(__dirname, '../playwright/.auth/admin.json')
const tenantAuthFile = path.join(__dirname, '../playwright/.auth/tenant.json')
// Keep legacy path for backwards compatibility
const userAuthFile = path.join(__dirname, '../playwright/.auth/user.json')

/**
 * Closed-Loop User Model Test Setup
 *
 * This setup assumes users already exist in the database (seeded via supabase/seed.sql).
 * Public signup is disabled - all users must be created by SysAdmin or OrgAdmin.
 *
 * Test Users (must be created via seed script before running tests):
 * - sysadmin@test.lineup.dev / TestPassword123! - SysAdmin (sys_admin role)
 * - orgadmin@test.lineup.dev / TestPassword123! - Organization Admin (org_admin role)
 * - orguser@test.lineup.dev / TestPassword123! - Organization User (org_user role)
 *
 * Environment Variables (override seeded users):
 * - TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD - SysAdmin credentials
 * - TEST_TENANT_EMAIL / TEST_TENANT_PASSWORD - OrgUser credentials
 * - TEST_USER_EMAIL / TEST_USER_PASSWORD - Legacy fallback
 */

interface RoleConfig {
  email: string
  password: string
  authFile: string
  expectedUrl: RegExp | string
  roleName: string
}

// Default test credentials (from seed.sql or env fallback)
// Priority: TEST_ADMIN_EMAIL > TEST_USER_EMAIL > seeded default
const DEFAULT_ADMIN_EMAIL = 'sysadmin@test.lineup.dev'
const DEFAULT_ADMIN_PASSWORD = 'TestPassword123!'
const DEFAULT_TENANT_EMAIL = 'orguser@test.lineup.dev'
const DEFAULT_TENANT_PASSWORD = 'TestPassword123!'

const ROLES: Record<string, RoleConfig> = {
  admin: {
    email: process.env.TEST_ADMIN_EMAIL || process.env.TEST_USER_EMAIL || DEFAULT_ADMIN_EMAIL,
    password: process.env.TEST_ADMIN_PASSWORD || process.env.TEST_USER_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    authFile: adminAuthFile,
    expectedUrl: /\/(admin|dashboard)/,
    roleName: 'SysAdmin',
  },
  tenant: {
    email: process.env.TEST_TENANT_EMAIL || process.env.TEST_USER_EMAIL || DEFAULT_TENANT_EMAIL,
    password: process.env.TEST_TENANT_PASSWORD || process.env.TEST_USER_PASSWORD || DEFAULT_TENANT_PASSWORD,
    authFile: tenantAuthFile,
    expectedUrl: /\/dashboard/,
    roleName: 'TenantUser',
  },
}

/**
 * Helper: Perform login for a given role
 * Note: Signup is no longer supported (closed-loop model)
 */
async function performLogin(
  page: import('@playwright/test').Page,
  role: RoleConfig
) {
  const { email, password, authFile, expectedUrl, roleName } = role

  console.log(`[${roleName}] Starting authentication with seeded user: ${email}`)

  // Navigate to login page
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  // Verify no signup link exists (closed-loop model)
  const signupLink = page.locator('a[href="/signup"]')
  const signupVisible = await signupLink.isVisible().catch(() => false)
  if (signupVisible) {
    console.warn(`[${roleName}] Warning: Signup link still visible - closed-loop model not fully implemented`)
  }

  // Fill login form
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)

  // Click sign in and wait for navigation
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ])

  // Give auth state time to settle
  await page.waitForTimeout(2000)

  console.log(`[${roleName}] Current URL after sign in: ${page.url()}`)

  // Wait for navigation away from login if still there
  if (page.url().includes('/login')) {
    // Check for error message
    const errorMessage = await page.locator('.text-destructive, [role="alert"]').textContent().catch(() => null)
    if (errorMessage) {
      throw new Error(`[${roleName}] Login failed: ${errorMessage}. Make sure the user exists (run supabase/seed.sql).`)
    }

    console.log(`[${roleName}] Still on login, waiting for navigation...`)
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    })
  }

  // Force reload to ensure auth state is properly initialized
  await page.reload()
  await page.waitForLoadState('networkidle')

  console.log(`[${roleName}] After reload URL: ${page.url()}`)

  // Note: With closed-loop model, users should never hit onboarding
  // If they do, it means the user wasn't properly seeded
  if (page.url().includes('/onboarding')) {
    throw new Error(`[${roleName}] User hit onboarding - this means the user was not properly seeded. Run supabase/seed.sql first.`)
  }

  // Verify we ended up at the expected URL
  await page.waitForLoadState('networkidle')
  const finalUrl = page.url()

  if (finalUrl.includes('/login')) {
    await page.screenshot({
      path: `playwright/.auth/${roleName.toLowerCase()}-login-failed.png`,
    })
    throw new Error(
      `[${roleName}] Still on login page. Authentication failed. Make sure the user exists in the database (run supabase/seed.sql).`
    )
  }

  // Validate expected URL pattern
  if (typeof expectedUrl === 'string') {
    if (!finalUrl.includes(expectedUrl)) {
      console.warn(
        `[${roleName}] Unexpected URL: ${finalUrl} (expected: ${expectedUrl})`
      )
    }
  } else if (!expectedUrl.test(finalUrl)) {
    console.warn(
      `[${roleName}] Unexpected URL: ${finalUrl} (expected: ${expectedUrl})`
    )
  }

  await page.screenshot({
    path: `playwright/.auth/${roleName.toLowerCase()}-authenticated.png`,
  })

  // Save authenticated state
  await page.context().storageState({ path: authFile })
  console.log(`[${roleName}] Auth state saved to ${authFile}`)
}

// =============================================================================
// SETUP: SysAdmin Authentication
// =============================================================================
setup('authenticate as admin (sys_admin)', async ({ page }) => {
  await performLogin(page, ROLES.admin)
})

// =============================================================================
// SETUP: Standard Tenant User Authentication
// =============================================================================
setup('authenticate as tenant user (org_user)', async ({ page }) => {
  await performLogin(page, ROLES.tenant)
})

// =============================================================================
// SETUP: Legacy user.json (for backwards compatibility)
// =============================================================================
setup('authenticate (legacy user.json)', async ({ page }) => {
  // Use admin credentials for legacy support, or env var overrides
  const email = process.env.TEST_USER_EMAIL || DEFAULT_ADMIN_EMAIL
  const password = process.env.TEST_USER_PASSWORD || DEFAULT_ADMIN_PASSWORD

  console.log('[Legacy] Authenticating with:', email)

  // Navigate to login page
  await page.goto('/login')

  // Fill login form
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)

  // Click sign in and wait for network to settle
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ])

  await page.waitForTimeout(2000)

  console.log('[Legacy] Current URL after sign in:', page.url())

  // Wait for navigation if still on login
  if (page.url().includes('/login')) {
    const errorMessage = await page.locator('.text-destructive, [role="alert"]').textContent().catch(() => null)
    if (errorMessage) {
      throw new Error(`[Legacy] Login failed: ${errorMessage}. Make sure the user exists (run supabase/seed.sql).`)
    }

    console.log('[Legacy] Still on login, waiting for navigation...')
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15000,
    })
  }

  // Force reload
  await page.reload()
  await page.waitForLoadState('networkidle')

  // With closed-loop model, users should never hit onboarding
  if (page.url().includes('/onboarding')) {
    throw new Error('[Legacy] User hit onboarding - user not properly seeded. Run supabase/seed.sql first.')
  }

  await page.waitForLoadState('networkidle')

  // Verify not still on login
  const finalUrl = page.url()
  if (finalUrl.includes('/login')) {
    throw new Error('[Legacy] Still on login page. Make sure the user exists in the database.')
  }

  // Save authenticated state
  await page.context().storageState({ path: userAuthFile })
  console.log('[Legacy] Auth state saved to', userAuthFile)
})
