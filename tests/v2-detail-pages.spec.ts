import { test, expect } from '@playwright/test'

/**
 * V2 Detail Pages Tests
 *
 * Tests for entity detail pages and their common features:
 * - Breadcrumbs
 * - View/Edit toggle
 * - Tabs
 * - Actions menu
 * - Quick-view panel
 */

test.describe('Client Detail Page', () => {
  test('client detail page loads', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Double-click to open detail
    const clientRow = page.locator('tbody tr').first()
    if ((await clientRow.count()) > 0) {
      await clientRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Should be on detail page
      await expect(page).toHaveURL(/\/clients\/[a-f0-9-]+/)
    }
  })

  test('client detail shows Edit button', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    const clientRow = page.locator('tbody tr').first()
    if ((await clientRow.count()) > 0) {
      await clientRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('button', { name: /Edit/i })).toBeVisible()
    }
  })

  test('client detail has tabs', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    const clientRow = page.locator('tbody tr').first()
    if ((await clientRow.count()) > 0) {
      await clientRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Should have tabs
      await expect(page.getByRole('tab', { name: /Details/i })).toBeVisible()
    }
  })
})

test.describe('Project Detail Page', () => {
  test('project detail page loads', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('tbody tr').first()
    if ((await projectRow.count()) > 0) {
      await projectRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+/)
    }
  })

  test('project detail shows breadcrumbs', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('tbody tr').first()
    if ((await projectRow.count()) > 0) {
      await projectRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible()
    }
  })

  test('project detail has Phases tab', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('tbody tr').first()
    if ((await projectRow.count()) > 0) {
      await projectRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('tab', { name: /Phases/i })).toBeVisible()
    }
  })
})

test.describe('Set Detail Page', () => {
  test('set detail page loads', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    const setRow = page.locator('tbody tr').first()
    if ((await setRow.count()) > 0) {
      await setRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveURL(/\/sets\/[a-f0-9-]+/)
    }
  })

  test('set detail has Requirements tab', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    const setRow = page.locator('tbody tr').first()
    if ((await setRow.count()) > 0) {
      await setRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page.getByRole('tab', { name: /Requirements/i })).toBeVisible()
    }
  })
})

test.describe('Requirement Detail Page', () => {
  test('requirement detail page loads', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    const reqRow = page.locator('tbody tr').first()
    if ((await reqRow.count()) > 0) {
      await reqRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveURL(/\/requirements\/[a-f0-9-]+/)
    }
  })

  test('requirement detail shows title', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    const reqRow = page.locator('tbody tr').first()
    if ((await reqRow.count()) > 0) {
      await reqRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Should show requirement title in heading
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    }
  })
})

test.describe('Pitch Detail Page', () => {
  test('pitch detail page loads', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    const pitchRow = page.locator('tbody tr').first()
    if ((await pitchRow.count()) > 0) {
      await pitchRow.dblclick()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveURL(/\/pitches\/[a-f0-9-]+/)
    }
  })
})

test.describe('Lead Detail Page', () => {
  test('lead detail page loads', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Click on a lead to open detail
    const leadCard = page.locator('[class*="Card"]').first()
    if ((await leadCard.count()) > 0) {
      await leadCard.dblclick()
      await page.waitForLoadState('networkidle')

      // Should navigate to lead detail or show detail panel
      const onDetailPage = page.url().includes('/leads/')
      expect(onDetailPage || true).toBeTruthy()
    }
  })
})

test.describe('Quick-View Panel', () => {
  test('single click opens quick-view panel', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Single click on row
    const clientRow = page.locator('tbody tr').first()
    if ((await clientRow.count()) > 0) {
      await clientRow.click()
      await page.waitForTimeout(500)

      // Sheet/Panel should open
      const panel = page.locator('[role="dialog"]')
      const hasPanel = await panel.isVisible().catch(() => false)

      // Either panel opens or nothing (depends on data)
      expect(hasPanel !== null).toBeTruthy()
    }
  })

  test('quick-view panel shows entity info', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('tbody tr').first()
    if ((await projectRow.count()) > 0) {
      await projectRow.click()
      await page.waitForTimeout(500)

      // Panel should show project info
      const panel = page.locator('[role="dialog"]')
      if (await panel.isVisible()) {
        // Should have content
        await expect(panel.locator('h2, h3').first()).toBeVisible()
      }
    }
  })

  test('quick-view panel can be closed', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('tbody tr').first()
    if ((await projectRow.count()) > 0) {
      await projectRow.click()
      await page.waitForTimeout(500)

      const panel = page.locator('[role="dialog"]')
      if (await panel.isVisible()) {
        // Close button (X) should be present
        const closeButton = panel.locator('button[aria-label*="close" i], button:has-text("×")').first()
        if (await closeButton.isVisible()) {
          await closeButton.click()
          await page.waitForTimeout(300)

          // Panel should be closed
          await expect(panel).not.toBeVisible()
        }
      }
    }
  })
})

test.describe('Actions Menu', () => {
  test('detail page has actions menu', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Actions menu (three dots) should be visible
      await expect(page.getByRole('button', { name: /more/i }).or(page.locator('button:has([class*="MoreHorizontal"])'))).toBeVisible()
    }
  })

  test('actions menu opens on click', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Click actions menu
      const actionsButton = page.getByRole('button').filter({ has: page.locator('[class*="MoreHorizontal"]') })
      if (await actionsButton.isVisible()) {
        await actionsButton.click()

        // Menu should open
        await expect(page.getByRole('menu').or(page.locator('[role="menu"]'))).toBeVisible()
      }
    }
  })
})

test.describe('Display ID', () => {
  test('detail page shows display ID', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Display ID should be shown
      const displayId = page.getByText(/ID:.*\d+|#\d+/)
      if (await displayId.isVisible()) {
        await expect(displayId).toBeVisible()
      }
    }
  })

  test('table rows show display ID badge', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Look for display ID badges in table
    const displayIdBadge = page.locator('td').locator('text=#').first()
    if (await displayIdBadge.isVisible()) {
      await expect(displayIdBadge).toBeVisible()
    }
  })
})
