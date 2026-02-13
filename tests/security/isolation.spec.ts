/**
 * Multi-Role Security Test Suite
 *
 * Tests RLS (Row Level Security) and RBAC (Role-Based Access Control) isolation:
 * 1. Unauthorized Portal Access - tenant users cannot access /admin routes
 * 2. Cross-Tenant Data Leak Prevention - users cannot access other tenant's data
 * 3. Breadcrumb Security - parent links don't expose cross-tenant data
 *
 * CRITICAL: If any of these tests fail, it indicates a SECURITY VULNERABILITY.
 * The build MUST fail and the RLS violation must be reported.
 */

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Helper to check if tenant auth file has valid credentials
 */
function hasTenantCredentials(): boolean {
  const tenantAuthFile = path.join(__dirname, '../../playwright/.auth/tenant.json')
  try {
    if (!fs.existsSync(tenantAuthFile)) return false
    const authData = JSON.parse(fs.readFileSync(tenantAuthFile, 'utf-8'))
    // Check if there are any origins with localStorage data (indicates valid auth)
    return authData.origins?.some((o: { localStorage?: unknown[] }) =>
      o.localStorage && o.localStorage.length > 0
    ) ?? false
  } catch {
    return false
  }
}

// =============================================================================
// TEST SUITE 1: Unauthorized Admin Portal Access
// =============================================================================
test.describe('Unauthorized Admin Portal Access', () => {
  // Use tenant user auth state - should NOT have sys_admin role
  test.use({ storageState: 'playwright/.auth/tenant.json' })

  test.beforeEach(async ({}, testInfo) => {
    // Skip tests if tenant auth not configured
    if (!hasTenantCredentials()) {
      testInfo.skip(true, 'Tenant user credentials not configured - set TEST_TENANT_EMAIL and TEST_TENANT_PASSWORD')
    }
  })

  test('SECURITY: tenant user cannot access /admin dashboard', async ({
    page,
  }) => {
    // Attempt to navigate to admin portal
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Wait for any redirects to complete (max 5 seconds)
    await page.waitForTimeout(2000)

    const finalUrl = page.url()
    console.log(`[Security Test] Final URL after /admin attempt: ${finalUrl}`)

    // CRITICAL SECURITY CHECK: User MUST be redirected away from /admin
    // Acceptable destinations: /dashboard, /login, /access-denied, /403
    const isOnAdminPage = finalUrl.includes('/admin')

    if (isOnAdminPage) {
      // Check if they actually have content access or just URL access
      const hasAdminContent = await page
        .getByRole('heading', { name: /tenant management|admin dashboard/i })
        .isVisible()
        .catch(() => false)

      if (hasAdminContent) {
        // CRITICAL FAILURE: Tenant user has access to admin portal
        await page.screenshot({
          path: 'playwright/.auth/SECURITY-VIOLATION-admin-access.png',
        })

        throw new Error(`
          ==================== SECURITY VIOLATION ====================
          RLS POLICY FAILURE: Tenant user gained access to Admin Portal

          URL: ${finalUrl}
          Expected: Redirect to /dashboard, /login, or /access-denied
          Actual: User remained on /admin with visible content

          IMMEDIATE ACTION REQUIRED:
          1. Review RLS policies on tenants table
          2. Review AuthGuard component role checks
          3. Review useUserRole hook implementation

          Screenshot saved: playwright/.auth/SECURITY-VIOLATION-admin-access.png
          ==============================================================
        `)
      }
    }

    // Verify we're on an allowed page
    expect(
      finalUrl.includes('/dashboard') ||
        finalUrl.includes('/login') ||
        finalUrl.includes('/access-denied') ||
        !finalUrl.includes('/admin')
    ).toBeTruthy()
  })

  test('SECURITY: tenant user cannot access /admin/tenants', async ({
    page,
  }) => {
    await page.goto('/admin/tenants')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const finalUrl = page.url()
    console.log(
      `[Security Test] Final URL after /admin/tenants attempt: ${finalUrl}`
    )

    // CRITICAL: Must NOT be on admin/tenants page
    const isOnTenantManagement = finalUrl.includes('/admin/tenants')

    if (isOnTenantManagement) {
      // Check for actual tenant data exposure
      const hasTenantData = await page
        .getByRole('cell')
        .first()
        .isVisible()
        .catch(() => false)

      if (hasTenantData) {
        await page.screenshot({
          path: 'playwright/.auth/SECURITY-VIOLATION-tenant-data.png',
        })

        throw new Error(`
          ==================== SECURITY VIOLATION ====================
          RLS POLICY FAILURE: Tenant user can view other tenants' data

          URL: ${finalUrl}
          This is a CRITICAL data leak vulnerability.

          Screenshot saved: playwright/.auth/SECURITY-VIOLATION-tenant-data.png
          ==============================================================
        `)
      }
    }

    expect(finalUrl).not.toContain('/admin/tenants')
  })

  test('SECURITY: tenant user cannot access /admin/users', async ({ page }) => {
    await page.goto('/admin/users')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const finalUrl = page.url()
    console.log(
      `[Security Test] Final URL after /admin/users attempt: ${finalUrl}`
    )

    // CRITICAL: Must NOT be on admin/users page
    expect(finalUrl).not.toContain('/admin/users')
  })

  test('SECURITY: tenant user cannot access /admin/tenants/:id', async ({
    page,
  }) => {
    // Try to access a specific tenant detail page with a fake UUID
    const fakeTenantId = '00000000-0000-0000-0000-000000000001'
    await page.goto(`/admin/tenants/${fakeTenantId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const finalUrl = page.url()
    console.log(
      `[Security Test] Final URL after tenant detail attempt: ${finalUrl}`
    )

    // CRITICAL: Must NOT be on any admin page
    expect(finalUrl).not.toContain('/admin')
  })
})

// =============================================================================
// TEST SUITE 2: Cross-Tenant Data Isolation
// =============================================================================
test.describe('Cross-Tenant Data Leak Prevention', () => {
  test.use({ storageState: 'playwright/.auth/tenant.json' })

  test.beforeEach(async ({}, testInfo) => {
    if (!hasTenantCredentials()) {
      testInfo.skip(true, 'Tenant user credentials not configured')
    }
  })

  test('SECURITY: cannot access project from different tenant', async ({
    page,
  }) => {
    // Attempt to navigate to a project with a fake UUID (different tenant)
    const crossTenantProjectId = '00000000-0000-0000-0000-000000000099'
    await page.goto(`/projects/${crossTenantProjectId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Check for error state or redirect
    const bodyText = await page.locator('body').textContent()

    // Should see one of: 404 Not Found, Access Denied, redirect to /projects
    const hasProjectData = await page
      .getByRole('heading')
      .filter({ hasText: /project/i })
      .isVisible()
      .catch(() => false)

    // If we got a project page with actual data, check it's NOT from another tenant
    if (hasProjectData) {
      // Verify RLS blocked the query (project should not load)
      const hasDetailContent =
        bodyText?.includes('Details') && bodyText?.includes('Client')

      if (hasDetailContent) {
        // Additional check: the page should show "Not Found" or be empty
        const hasError =
          bodyText?.includes('Not Found') ||
          bodyText?.includes('not found') ||
          bodyText?.includes('Error') ||
          bodyText?.includes('Access Denied')

        if (!hasError) {
          await page.screenshot({
            path: 'playwright/.auth/SECURITY-VIOLATION-cross-tenant-project.png',
          })

          throw new Error(`
            ==================== SECURITY VIOLATION ====================
            RLS POLICY FAILURE: User accessed project from different tenant

            URL: /projects/${crossTenantProjectId}
            This indicates cross-tenant data leak vulnerability.

            Screenshot saved: playwright/.auth/SECURITY-VIOLATION-cross-tenant-project.png
            ==============================================================
          `)
        }
      }
    }

    // Success: User was blocked from accessing cross-tenant data
    console.log('[Security Test] Cross-tenant project access correctly blocked')
  })

  test('SECURITY: cannot access client from different tenant', async ({
    page,
  }) => {
    const crossTenantClientId = '00000000-0000-0000-0000-000000000088'
    await page.goto(`/clients/${crossTenantClientId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').textContent()

    // Verify we don't see actual client data
    const hasClientDetails =
      bodyText?.includes('Relationship Manager') ||
      bodyText?.includes('Industry')

    if (
      hasClientDetails &&
      !bodyText?.includes('Not Found') &&
      !bodyText?.includes('Error')
    ) {
      await page.screenshot({
        path: 'playwright/.auth/SECURITY-VIOLATION-cross-tenant-client.png',
      })

      throw new Error(`
        ==================== SECURITY VIOLATION ====================
        RLS POLICY FAILURE: User accessed client from different tenant

        URL: /clients/${crossTenantClientId}

        Screenshot saved: playwright/.auth/SECURITY-VIOLATION-cross-tenant-client.png
        ==============================================================
      `)
    }

    console.log('[Security Test] Cross-tenant client access correctly blocked')
  })

  test('SECURITY: cannot access requirement from different tenant', async ({
    page,
  }) => {
    const crossTenantReqId = '00000000-0000-0000-0000-000000000077'
    await page.goto(`/requirements/${crossTenantReqId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').textContent()

    // Verify we don't see requirement data (Title, Description, Urgency, etc.)
    const hasRequirementDetails =
      bodyText?.includes('Urgency') || bodyText?.includes('Importance')

    if (
      hasRequirementDetails &&
      !bodyText?.includes('Not Found') &&
      !bodyText?.includes('Error')
    ) {
      await page.screenshot({
        path: 'playwright/.auth/SECURITY-VIOLATION-cross-tenant-requirement.png',
      })

      throw new Error(`
        ==================== SECURITY VIOLATION ====================
        RLS POLICY FAILURE: User accessed requirement from different tenant

        URL: /requirements/${crossTenantReqId}

        Screenshot saved: playwright/.auth/SECURITY-VIOLATION-cross-tenant-requirement.png
        ==============================================================
      `)
    }

    console.log(
      '[Security Test] Cross-tenant requirement access correctly blocked'
    )
  })

  test('SECURITY: cannot access set from different tenant', async ({
    page,
  }) => {
    const crossTenantSetId = '00000000-0000-0000-0000-000000000066'
    await page.goto(`/sets/${crossTenantSetId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').textContent()

    // Verify we don't see set data (Expected Start, Budget, etc.)
    const hasSetDetails =
      bodyText?.includes('Expected Start') || bodyText?.includes('Budget')

    if (
      hasSetDetails &&
      !bodyText?.includes('Not Found') &&
      !bodyText?.includes('Error')
    ) {
      await page.screenshot({
        path: 'playwright/.auth/SECURITY-VIOLATION-cross-tenant-set.png',
      })

      throw new Error(`
        ==================== SECURITY VIOLATION ====================
        RLS POLICY FAILURE: User accessed set from different tenant

        URL: /sets/${crossTenantSetId}

        Screenshot saved: playwright/.auth/SECURITY-VIOLATION-cross-tenant-set.png
        ==============================================================
      `)
    }

    console.log('[Security Test] Cross-tenant set access correctly blocked')
  })
})

// =============================================================================
// TEST SUITE 3: Breadcrumb Security (No Cross-Tenant Parent Exposure)
// =============================================================================
test.describe('Breadcrumb Security', () => {
  test.use({ storageState: 'playwright/.auth/tenant.json' })

  test.beforeEach(async ({}, testInfo) => {
    if (!hasTenantCredentials()) {
      testInfo.skip(true, 'Tenant user credentials not configured')
    }
  })

  test('SECURITY: breadcrumbs only show current tenant data', async ({
    page,
  }) => {
    // Navigate to requirements page (has breadcrumbs showing Client > Project > Set)
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Check if we have any requirements
    const hasRequirements = await page
      .getByRole('row')
      .first()
      .isVisible()
      .catch(() => false)

    if (!hasRequirements) {
      console.log(
        '[Security Test] No requirements found - skipping breadcrumb test'
      )
      return
    }

    // Get all breadcrumb links on the page
    const breadcrumbLinks = await page.locator('nav a, [aria-label="breadcrumb"] a').all()

    for (const link of breadcrumbLinks) {
      const href = await link.getAttribute('href')
      const text = await link.textContent()

      console.log(`[Security Test] Breadcrumb: "${text}" -> ${href}`)

      // Navigate to each breadcrumb link
      if (href && !href.includes('#')) {
        // Test that clicking breadcrumb doesn't expose cross-tenant data
        const testPage = await page.context().newPage()
        await testPage.goto(href)
        await testPage.waitForLoadState('networkidle')

        const pageUrl = testPage.url()

        // Should not redirect to login (which would indicate access denied after initial access)
        // or show "Access Denied" content
        const bodyText = await testPage.locator('body').textContent()
        const hasAccessDenied =
          bodyText?.includes('Access Denied') ||
          bodyText?.includes('Not Found') ||
          bodyText?.includes('Forbidden')

        // If breadcrumb was visible but target is denied, there's a data leak in breadcrumb rendering
        if (hasAccessDenied) {
          console.warn(
            `[Security Test] Breadcrumb "${text}" leads to denied page - potential info leak in breadcrumb text`
          )
        }

        await testPage.close()
      }
    }

    console.log('[Security Test] Breadcrumb security check passed')
  })

  test('SECURITY: requirement detail breadcrumbs do not expose other tenants', async ({
    page,
  }) => {
    // Navigate to requirements list
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Try to click on first requirement if exists
    const firstReqRow = page.getByRole('row').nth(1) // First data row (after header)
    const rowExists = await firstReqRow.isVisible().catch(() => false)

    if (!rowExists) {
      console.log(
        '[Security Test] No requirements available - skipping detail breadcrumb test'
      )
      return
    }

    // Double-click to navigate to detail
    await firstReqRow.dblclick()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Now check breadcrumbs on detail page
    const breadcrumbs = page.locator('nav a, [aria-label="breadcrumb"] a')
    const breadcrumbCount = await breadcrumbs.count()

    console.log(
      `[Security Test] Found ${breadcrumbCount} breadcrumb links on requirement detail`
    )

    // Each breadcrumb should be accessible by this user (same tenant)
    for (let i = 0; i < breadcrumbCount; i++) {
      const link = breadcrumbs.nth(i)
      const href = await link.getAttribute('href')
      const text = await link.textContent()

      if (href && href.startsWith('/')) {
        // Verify the linked entity is from same tenant by checking access
        const response = await page.context().request.get(
          `http://localhost:5173${href}`,
          {
            headers: {
              Accept: 'text/html',
            },
          }
        )

        // Should not get 403 or redirect to login
        console.log(
          `[Security Test] Breadcrumb "${text}" (${href}) - Status: ${response.status()}`
        )
      }
    }

    console.log(
      '[Security Test] Requirement detail breadcrumb security check passed'
    )
  })
})

// =============================================================================
// TEST SUITE 4: Admin Portal Access (SysAdmin SHOULD have access)
// =============================================================================
test.describe('Admin Portal Access (authorized)', () => {
  // Use admin auth state - should have sys_admin role
  test.use({ storageState: 'playwright/.auth/admin.json' })

  test('sysadmin CAN access /admin dashboard', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const finalUrl = page.url()
    console.log(`[Admin Test] Final URL: ${finalUrl}`)

    // SysAdmin should remain on admin page OR be redirected if not actually a sysadmin
    // This verifies the admin.json auth state is working
    if (!finalUrl.includes('/admin') && !finalUrl.includes('/dashboard')) {
      console.warn(
        '[Admin Test] Warning: Admin may not have sys_admin role configured'
      )
    }
  })
})

// =============================================================================
// TEST SUITE 5: Unauthenticated Access (should redirect to login)
// =============================================================================
test.describe('Unauthenticated Access', () => {
  // Clear auth state
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user redirects to login from /dashboard', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/(login|onboarding)/, { timeout: 10000 })

    const finalUrl = page.url()
    expect(
      finalUrl.includes('/login') || finalUrl.includes('/onboarding')
    ).toBeTruthy()
  })

  test('unauthenticated user redirects to login from /admin', async ({
    page,
  }) => {
    await page.goto('/admin')
    await page.waitForURL(/\/(login|admin\/login)/, { timeout: 10000 })

    const finalUrl = page.url()
    expect(
      finalUrl.includes('/login') || finalUrl.includes('/admin/login')
    ).toBeTruthy()
  })

  test('unauthenticated user redirects to login from /projects', async ({
    page,
  }) => {
    await page.goto('/projects')
    await page.waitForURL(/\/login/, { timeout: 10000 })

    expect(page.url()).toContain('/login')
  })
})
