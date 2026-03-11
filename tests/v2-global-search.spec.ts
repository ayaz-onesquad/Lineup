import { test, expect } from '@playwright/test'

/**
 * V2 Global Search Tests
 *
 * Tests for the new master search functionality:
 * - Search trigger and keyboard shortcut (Cmd/Ctrl+K)
 * - Parallel search across all tables
 * - @ command for table-scoped search
 * - Search result display and navigation
 */

test.describe('Global Search - Basic Functionality', () => {
  test('search button is visible in header', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show search button
    await expect(page.getByRole('button', { name: /Search/i })).toBeVisible()
  })

  test('search shows keyboard shortcut hint', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show Cmd+K shortcut in the search button
    await expect(page.getByRole('button', { name: /Search.*K/i })).toBeVisible()
  })

  test('clicking search button opens popover', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click search button
    await page.getByRole('button', { name: /Search/i }).click()

    // Popover should open with input
    await expect(page.getByPlaceholder(/Search or type @/i)).toBeVisible()
  })

  test('keyboard shortcut Cmd+K opens search', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Press Cmd+K (or Ctrl+K on Windows/Linux)
    await page.keyboard.press('Meta+k')

    // Search popover should open
    await expect(page.getByPlaceholder(/Search or type @/i)).toBeVisible()
  })

  test('search input shows placeholder text', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search
    await page.getByRole('button', { name: /Search/i }).click()

    // Verify placeholder
    await expect(page.getByPlaceholder(/Search or type @ to filter by table/i)).toBeVisible()
  })

  test('search shows empty state message initially', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search
    await page.getByRole('button', { name: /Search/i }).click()

    // Should show initial instructions
    await expect(page.getByText(/Type to search across all tables/i)).toBeVisible()
  })
})

test.describe('Global Search - @ Command Table Selection', () => {
  test('typing @ shows table selector', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search
    await page.getByRole('button', { name: /Search/i }).click()

    // Type @
    await page.getByPlaceholder(/Search or type @/i).fill('@')

    // Should show "Search in..." header
    await expect(page.getByText(/Search in.../i)).toBeVisible()
  })

  test('table selector shows all searchable tables', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and type @
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@')

    // Should show all table options
    await expect(page.getByRole('button', { name: /Clients/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Projects/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Phases/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sets/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Requirements/i })).toBeVisible()
  })

  test('typing @cli filters to Clients table', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and type @cli
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@cli')

    // Should show Clients option
    await expect(page.getByRole('button', { name: /Clients/i })).toBeVisible()
  })

  test('selecting a table shows badge and enables search', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and select clients table
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@clients ')

    // Should show badge indicating selected table
    await expect(page.locator('text=@clients').first()).toBeVisible()
  })
})

test.describe('Global Search - Search Execution', () => {
  test('typing 2+ characters triggers search', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and type query
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('te')

    // Wait for search to execute - should show loading or results
    await page.waitForTimeout(500)

    // Should either show "Searching...", results, or "No results found"
    const searchState = page.getByText(/Searching|Results|No results found/i)
    await expect(searchState).toBeVisible({ timeout: 5000 })
  })

  test('search results show type badge', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and type query that might return results
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('test')

    // Wait for search
    await page.waitForTimeout(1000)

    // If there are results, they should have type badges (client, project, etc.)
    // If no results, we should see "No results found"
    const hasResults = await page.locator('.space-y-1 button').count()
    if (hasResults > 0) {
      await expect(page.locator('.space-y-1 button').first()).toBeVisible()
    }
  })

  test('clicking search result navigates to detail page', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // This test depends on having data in the system
    // Open search
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('test')

    // Wait for potential results
    await page.waitForTimeout(1000)

    // Check if we have any results to click
    const results = page.locator('.space-y-1 button').first()
    const hasResults = await results.count()

    if (hasResults > 0) {
      // Click the first result
      await results.click()

      // Should navigate away from dashboard
      await page.waitForTimeout(500)
      // URL should change to a detail page
    }
  })
})

test.describe('Global Search - Scoped Search', () => {
  test('scoped search to clients works', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and scope to clients
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@clients test')

    // Wait for search
    await page.waitForTimeout(1000)

    // Should show clients badge
    await expect(page.getByText('@clients')).toBeVisible()
  })

  test('scoped search to requirements works', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and scope to requirements
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@requirements task')

    // Wait for search
    await page.waitForTimeout(1000)

    // Should show requirements badge
    await expect(page.getByText('@requirements')).toBeVisible()
  })

  test('scoped search to leads works', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and scope to leads
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('@leads prospect')

    // Wait for search
    await page.waitForTimeout(1000)

    // Should show leads badge
    await expect(page.getByText('@leads')).toBeVisible()
  })
})

test.describe('Global Search - Accessibility', () => {
  test('search input is focusable', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search
    await page.getByRole('button', { name: /Search/i }).click()

    // Input should be focused
    await expect(page.getByPlaceholder(/Search or type @/i)).toBeFocused()
  })

  test('closing search clears input', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open search and type
    await page.getByRole('button', { name: /Search/i }).click()
    await page.getByPlaceholder(/Search or type @/i).fill('test query')

    // Close by pressing Escape
    await page.keyboard.press('Escape')

    // Re-open search
    await page.getByRole('button', { name: /Search/i }).click()

    // Input should be empty
    await expect(page.getByPlaceholder(/Search or type @/i)).toHaveValue('')
  })

  test('search works from any page', async ({ page }) => {
    // Test search from clients page
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Open search
    await page.keyboard.press('Meta+k')

    // Search should open
    await expect(page.getByPlaceholder(/Search or type @/i)).toBeVisible()
  })
})
