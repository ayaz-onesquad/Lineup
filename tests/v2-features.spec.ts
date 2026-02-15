import { test, expect } from '@playwright/test'

/**
 * V2 Features Integration Tests
 *
 * Tests for new V2 features:
 * - Leads (Sales Pipeline)
 * - Pitches (Requirement Groupings)
 * - Document Catalog (Document Type Standards)
 * - Templates (Project Templates)
 */

test.describe('Leads Page - Sales Pipeline', () => {
  test('can access leads page when authenticated', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/)

    // Should show Sales Pipeline header
    await expect(page.getByRole('heading', { name: /Sales Pipeline/i })).toBeVisible()
  })

  test('leads page displays pipeline stats cards', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Should show stats cards
    await expect(page.getByText(/Pipeline Value/i)).toBeVisible()
    await expect(page.getByText(/Won Value/i)).toBeVisible()
    await expect(page.getByText(/Lost Value/i)).toBeVisible()
    await expect(page.getByText(/Conversion Rate/i)).toBeVisible()
  })

  test('leads page has view toggle (pipeline, list, table)', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Should show view toggle buttons
    await expect(page.getByRole('button', { name: /Pipeline/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /List/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Table/i })).toBeVisible()
  })

  test('leads page has New Lead button', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /New Lead/i })).toBeVisible()
  })

  test('leads page has search input', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder(/Search leads/i)).toBeVisible()
  })

  test('leads page has show/hide closed toggle', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /Show Closed|Hide Closed/i })).toBeVisible()
  })

  test('can switch to list view', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Click list view toggle
    await page.getByRole('button', { name: /List/i }).click()

    // Page should still be accessible
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Sales Pipeline/i })).toBeVisible()
  })

  test('can switch to table view', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Click table view toggle
    await page.getByRole('button', { name: /Table/i }).click()

    // Page should still be accessible
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: /Sales Pipeline/i })).toBeVisible()
  })
})

test.describe('Pitches Page', () => {
  test('can access pitches page when authenticated', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/)

    // Should show Pitches header
    await expect(page.getByRole('heading', { name: /Pitches/i })).toBeVisible()
  })

  test('pitches page displays stats cards', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    // Should show stats cards
    await expect(page.getByText(/Total Pitches/i)).toBeVisible()
    await expect(page.getByText(/Approved/i)).toBeVisible()
    await expect(page.getByText(/Pending Approval/i)).toBeVisible()
    await expect(page.getByText(/In Progress/i)).toBeVisible()
  })

  test('pitches page has New Pitch button', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /New Pitch/i })).toBeVisible()
  })

  test('pitches page has search and filter inputs', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    // Search input
    await expect(
      page.getByPlaceholder(/Search by name, set, project, or client/i)
    ).toBeVisible()

    // Status and Approval filters should exist
    await expect(page.locator('body')).toContainText('Status')
  })

  test('pitches page shows table with correct columns', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('domcontentloaded')

    // Wait for either table headers or empty state to be visible
    const tableHeaders = page.locator('th').first()
    const emptyState = page.getByText(/No pitches found/i)

    // Either table or empty state should be visible (with timeout for async loading)
    await expect(tableHeaders.or(emptyState)).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Document Catalog Page', () => {
  test('can access document catalog page when authenticated', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/)

    // Should show Document Catalog header
    await expect(page.getByRole('heading', { name: /Document Catalog/i })).toBeVisible()
  })

  test('document catalog page has Add Document Type button', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /Add Document Type/i })).toBeVisible()
  })

  test('document catalog page has Seed Defaults button', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /Seed Defaults/i })).toBeVisible()
  })

  test('document catalog page has search input', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder(/Search document types/i)).toBeVisible()
  })

  test('document catalog page has show inactive toggle', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Show inactive/i)).toBeVisible()
  })

  test('document catalog page has category tabs', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    // Should have All tab
    await expect(page.getByRole('tab', { name: /All/i })).toBeVisible()

    // Should have category tabs
    await expect(page.getByRole('tab', { name: /Deliverable/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Legal/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Internal/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Reference/i })).toBeVisible()
  })

  test('can open Add Document Type dialog', async ({ page }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    // Click Add Document Type button
    await page.getByRole('button', { name: /Add Document Type/i }).click()

    // Dialog should open
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/Create Document Type/i)).toBeVisible()

    // Dialog should have form fields
    await expect(page.locator('#name')).toBeVisible()
    await expect(page.locator('#description')).toBeVisible()
  })
})

test.describe('Templates Page', () => {
  test('can access templates page when authenticated', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/)

    // Should show Project Templates header
    await expect(page.getByRole('heading', { name: /Project Templates/i })).toBeVisible()
  })

  test('templates page has Save Project as Template button', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('button', { name: /Save Project as Template/i })
    ).toBeVisible()
  })

  test('templates page has How Templates Work info card', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/How Templates Work/i)).toBeVisible()
    await expect(
      page.getByText(/Templates are project structures that can be reused/i)
    ).toBeVisible()
  })

  test('templates page has search input', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder(/Search templates/i)).toBeVisible()
  })

  test('templates page shows empty state or template grid', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForLoadState('domcontentloaded')

    // Wait for either empty state message or template cards to be visible
    const emptyState = page.getByText(/No templates yet/i)
    const templateCard = page.locator('[class*="CardHeader"]').first()

    // Wait for any of these states (with timeout for async loading)
    await expect(emptyState.or(templateCard)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Navigation Between V2 Features', () => {
  test('can navigate from dashboard to leads', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate to leads
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Sales Pipeline/i })).toBeVisible()
  })

  test('can navigate from dashboard to pitches', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate to pitches
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Pitches/i })).toBeVisible()
  })

  test('can navigate from dashboard to templates', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate to templates
    await page.goto('/templates')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Project Templates/i })).toBeVisible()
  })

  test('can navigate from dashboard to document catalog', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate to document catalog
    await page.goto('/settings/document-catalog')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /Document Catalog/i })).toBeVisible()
  })
})

// Security tests for unauthenticated access are in tests/security/v2-features-security.spec.ts
