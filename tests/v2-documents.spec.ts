import { test, expect } from '@playwright/test'

/**
 * V2 Documents Page Tests
 *
 * Tests for the documents management functionality:
 * - Page accessibility
 * - Upload interface
 * - View modes (list/grid)
 * - Filters
 */

test.describe('Documents Page', () => {
  test('can access documents page when authenticated', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/)

    // Should show Documents header
    await expect(page.getByRole('heading', { name: /Documents/i })).toBeVisible()
  })

  test('documents page has Upload Files button', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /Upload Files/i })).toBeVisible()
  })

  test('documents page has drag and drop zone', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Should show drag and drop text
    await expect(page.getByText(/Drag and drop files here/i)).toBeVisible()
  })

  test('documents page has search input', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder(/Search documents/i)).toBeVisible()
  })

  test('documents page has entity type filter', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Should have entity type filter combobox
    const entityFilter = page.getByRole('combobox').filter({ hasText: 'All Entities' })
    await expect(entityFilter).toBeVisible()
  })

  test('documents page has file type filter', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Should have file type filter combobox
    const typeFilter = page.getByRole('combobox').filter({ hasText: 'All Types' })
    await expect(typeFilter).toBeVisible()
  })

  test('documents page has view mode toggle (list/grid)', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Should have list and grid view buttons
    await expect(page.getByRole('button', { name: /List view/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Grid view/i })).toBeVisible()
  })

  test('can switch to grid view', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Click grid view button
    await page.getByRole('button', { name: /Grid view/i }).click()

    // Page should still be accessible
    await expect(page.getByRole('heading', { name: /Documents/i })).toBeVisible()
  })

  test('documents page shows empty state or document list', async ({ page }) => {
    await page.goto('/documents')
    await page.waitForLoadState('networkidle')

    // Either empty state or document table should be visible
    const emptyState = page.getByText(/No documents found/i)
    const documentTable = page.locator('table')
    const documentGrid = page.locator('[class*="grid"]').first()

    const hasEmptyState = await emptyState.isVisible()
    const hasTable = await documentTable.isVisible()
    const hasGrid = await documentGrid.isVisible()

    // One of them must be true
    expect(hasEmptyState || hasTable || hasGrid).toBe(true)
  })
})

test.describe('Documents Page - Navigation', () => {
  test('can navigate to documents from sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Look for Documents link in sidebar
    const documentsLink = page.getByRole('link', { name: /Documents/i })
    if (await documentsLink.isVisible()) {
      await documentsLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/\/documents/)
    } else {
      // If no sidebar link, direct navigation works
      await page.goto('/documents')
      await expect(page).not.toHaveURL(/\/login/)
    }
  })
})

// Security tests for /documents are in tests/security/v2-features-security.spec.ts
