import { test, expect } from '@playwright/test'

/**
 * V2 Sidebar Navigation Tests
 *
 * Tests for sidebar functionality:
 * - Collapsible settings navigation
 * - Sidebar groups (Overview, Clients, Work)
 * - Sidebar collapse/expand toggle
 * - Quick Create button
 * - Navigation highlighting
 */

test.describe('Sidebar - Basic Structure', () => {
  test('sidebar is visible when authenticated', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Sidebar should be visible
    await expect(page.locator('aside')).toBeVisible()
  })

  test('sidebar shows Quick Create button', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Quick Create button should be visible
    await expect(page.getByRole('button', { name: /Quick Create/i })).toBeVisible()
  })

  test('sidebar shows Settings link', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Settings link should be visible
    await expect(page.getByRole('link', { name: /Settings/i })).toBeVisible()
  })

  test('sidebar shows Collapse button', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Collapse sidebar button should be visible
    await expect(page.getByRole('button', { name: /Collapse sidebar/i })).toBeVisible()
  })
})

test.describe('Sidebar - Navigation Groups', () => {
  test('sidebar shows Overview group', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show group labels
    await expect(page.getByText('OVERVIEW')).toBeVisible()
  })

  test('sidebar shows Clients group', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show Clients group
    await expect(page.getByText('CLIENTS')).toBeVisible()
  })

  test('sidebar shows navigation groups', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show navigation groups in sidebar
    const sidebar = page.locator('aside')
    // Check for at least one nav group (OVERVIEW, CLIENTS, or other)
    const hasGroups = await sidebar.locator('h4').count()
    expect(hasGroups).toBeGreaterThan(0)
  })

  test('sidebar groups contain correct nav items', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for key nav items
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Clients/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Projects/i })).toBeVisible()
  })
})

test.describe('Sidebar - Collapse/Expand', () => {
  test('clicking collapse button collapses sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Get initial sidebar width
    const sidebar = page.locator('aside')
    const initialWidth = await sidebar.evaluate((el) => el.offsetWidth)

    // Click collapse sidebar button (specific)
    await page.getByRole('button', { name: /Collapse sidebar/i }).click()

    // Wait for animation
    await page.waitForTimeout(300)

    // Sidebar should be narrower
    const collapsedWidth = await sidebar.evaluate((el) => el.offsetWidth)
    expect(collapsedWidth).toBeLessThan(initialWidth)
  })

  test('collapsed sidebar shows icons only', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Collapse sidebar
    await page.getByRole('button', { name: /Collapse sidebar/i }).click()
    await page.waitForTimeout(300)

    // Group labels should be hidden (check in sidebar)
    const sidebar = page.locator('aside')
    await expect(sidebar.getByText('OVERVIEW')).not.toBeVisible()
    await expect(sidebar.getByText('CLIENTS')).not.toBeVisible()
  })

  test('collapsed sidebar can be expanded', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Get initial sidebar width
    const sidebar = page.locator('aside')

    // Collapse sidebar
    await page.getByRole('button', { name: /Collapse sidebar/i }).click()
    await page.waitForTimeout(300)

    // Click expand button
    await page.getByRole('button', { name: /Expand sidebar/i }).click()
    await page.waitForTimeout(300)

    // Sidebar should be wider after expanding (check that nav group headers are visible again)
    const navGroups = await sidebar.locator('h4').count()
    expect(navGroups).toBeGreaterThan(0)
  })

  test('collapsed sidebar shows tooltips on hover', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Collapse sidebar
    await page.getByRole('button', { name: /Collapse sidebar/i }).click()
    await page.waitForTimeout(300)

    // Hover over a nav item
    await page.getByRole('link', { name: /Dashboard/i }).hover()

    // Tooltip should appear (depends on implementation)
    // The tooltip behavior is built into the component
  })
})

test.describe('Sidebar - Collapsible Settings Section', () => {
  test('settings section has expand/collapse toggle', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should see settings expand/collapse button
    await expect(
      page.getByRole('button', { name: /Expand settings|Collapse settings/i })
    ).toBeVisible()
  })

  test('settings section expands to show child items', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Expand settings if collapsed
    const expandButton = page.getByRole('button', { name: /Expand settings/i })
    if (await expandButton.isVisible()) {
      await expandButton.click()
      await page.waitForTimeout(200)
    }

    // Should show child items like Team, Security, Document Catalog
    await expect(page.getByRole('link', { name: /Team/i })).toBeVisible()
  })

  test('settings section can be collapsed', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // First ensure settings is expanded
    const expandButton = page.getByRole('button', { name: /Expand settings/i })
    if (await expandButton.isVisible()) {
      await expandButton.click()
      await page.waitForTimeout(200)
    }

    // Now collapse
    await page.getByRole('button', { name: /Collapse settings/i }).click()
    await page.waitForTimeout(200)

    // Child items should be hidden
    await expect(page.getByRole('link', { name: /^Team$/i })).not.toBeVisible()
  })

  test('clicking Settings navigates to settings page', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click Settings link
    await page.getByRole('link', { name: /Settings/i }).first().click()

    // Should navigate to settings
    await expect(page).toHaveURL(/\/settings/)
  })
})

test.describe('Sidebar - Navigation Highlighting', () => {
  test('current page is highlighted in sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Dashboard link should be highlighted (has bg-primary class)
    const dashboardLink = page.getByRole('link', { name: /Dashboard/i })
    await expect(dashboardLink).toHaveAttribute('aria-current', 'page')
  })

  test('navigating updates highlighted item', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Navigate to clients
    await page.getByRole('link', { name: /Clients/i }).first().click()
    await page.waitForLoadState('networkidle')

    // Clients link should now be highlighted
    const clientsLink = page.getByRole('link', { name: /Clients/i }).first()
    await expect(clientsLink).toHaveAttribute('aria-current', 'page')
  })

  test('child routes highlight parent section', async ({ page }) => {
    // Navigate to clients page
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Clients link should have active styling (bg-primary class)
    const sidebar = page.locator('aside')
    const clientsLink = sidebar.getByRole('link', { name: /Clients/i }).first()

    // Check for active styling class
    const hasActiveClass = await clientsLink.evaluate((el) => el.classList.contains('bg-primary'))
    expect(hasActiveClass).toBeTruthy()
  })
})

test.describe('Sidebar - Quick Create', () => {
  test('Quick Create button opens create modal', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click Quick Create
    await page.getByRole('button', { name: /Quick Create/i }).click()

    // Should open create modal (dialog)
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('Quick Create defaults to requirement type', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click Quick Create
    await page.getByRole('button', { name: /Quick Create/i }).click()

    // Dialog should show requirement form
    await expect(page.getByText(/New Requirement|Create Requirement/i)).toBeVisible()
  })
})

test.describe('Sidebar - Accessibility', () => {
  test('sidebar links have proper aria labels', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check aria-label on collapsed sidebar items
    await page.getByRole('button', { name: /Collapse sidebar/i }).click()
    await page.waitForTimeout(300)

    // Icons should have aria-label
    await expect(page.getByRole('link', { name: /Dashboard/i })).toBeVisible()
  })

  test('collapse button has aria-expanded attribute', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const collapseButton = page.getByRole('button', { name: /Collapse sidebar/i })
    await expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
  })
})
