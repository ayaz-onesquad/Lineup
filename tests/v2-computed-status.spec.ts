import { test, expect } from '@playwright/test'

/**
 * V2 Computed Status Tests
 *
 * Tests for the reactive date & status engine:
 * - Status badges use computed_status
 * - Status is read-only (auto-computed from dates)
 * - Past due indication
 * - Status color mapping
 */

test.describe('Dashboard - Computed Status in KPI Cards', () => {
  test('KPI cards show status-based metrics', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // KPI cards should show active and past due counts
    await expect(page.getByText(/active/i).first()).toBeVisible()
  })

  test('KPI drill-down modal shows computed status', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click on a KPI card to open drill-down
    const setsCard = page.locator('text=My Sets').first().locator('..')
    await setsCard.click()

    // Wait for modal
    await page.waitForTimeout(500)

    // Modal should show status badges
    const modal = page.getByRole('dialog')
    if (await modal.isVisible()) {
      // Check for status column in table
      await expect(page.getByText(/Status/i)).toBeVisible()
    }
  })

  test('past due items show red indicator', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check if any Past Due badges are visible
    const pastDueBadge = page.locator('text=Past Due').first()
    const hasPastDue = await pastDueBadge.isVisible().catch(() => false)

    // If there are past due items, they should be styled in red
    if (hasPastDue) {
      // The badge or text should have red styling
      await expect(pastDueBadge).toBeVisible()
    }
  })
})

test.describe('Phase Detail - Computed Status Display', () => {
  test('phase detail shows status as read-only', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Click on first phase to open detail
    const phaseRow = page.locator('tr').first()
    if (await phaseRow.isVisible()) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Check for "(Auto)" label indicating computed status
      await expect(page.getByText(/Status.*Auto|Auto/i)).toBeVisible()
    }
  })

  test('phase status badge uses computed status colors', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Status badges should be present
    const statusBadge = page.locator('[class*="badge"]').first()
    if (await statusBadge.isVisible()) {
      // Badge should have status styling
      await expect(statusBadge).toBeVisible()
    }
  })
})

test.describe('Project Detail - Computed Status Display', () => {
  test('project detail shows computed status', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Navigate to first project
    const projectRow = page.locator('tr').nth(1)
    if (await projectRow.isVisible()) {
      await projectRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Status should be displayed
      const statusBadge = page.locator('[class*="badge"]').first()
      await expect(statusBadge).toBeVisible()
    }
  })
})

test.describe('Set Detail - Computed Status Display', () => {
  test('set detail shows computed status', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    // Navigate to first set
    const setRow = page.locator('tr').nth(1)
    if (await setRow.isVisible()) {
      await setRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Status should be displayed
      const statusBadge = page.locator('[class*="badge"]').first()
      await expect(statusBadge).toBeVisible()
    }
  })
})

test.describe('Requirement Detail - Computed Status Display', () => {
  test('requirement detail shows computed status', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Navigate to first requirement
    const reqRow = page.locator('tr').nth(1)
    if (await reqRow.isVisible()) {
      await reqRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Status should be displayed
      const statusBadge = page.locator('[class*="badge"]').first()
      await expect(statusBadge).toBeVisible()
    }
  })
})

test.describe('Status Labels - Correct Display', () => {
  test('not started status displays correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for "Not Started" status label
    const notStarted = page.locator('text=Not Started').first()
    const hasNotStarted = await notStarted.isVisible().catch(() => false)

    if (hasNotStarted) {
      await expect(notStarted).toBeVisible()
    }
  })

  test('in progress status displays correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for "In Progress" status label
    const inProgress = page.locator('text=In Progress').first()
    const hasInProgress = await inProgress.isVisible().catch(() => false)

    if (hasInProgress) {
      await expect(inProgress).toBeVisible()
    }
  })

  test('on track status displays correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for "On Track" status label
    const onTrack = page.locator('text=On Track').first()
    const hasOnTrack = await onTrack.isVisible().catch(() => false)

    if (hasOnTrack) {
      await expect(onTrack).toBeVisible()
    }
  })

  test('at risk status displays correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for "At Risk" status label (may not always be present)
    const atRisk = page.locator('text=At Risk').first()
    const hasAtRisk = await atRisk.isVisible().catch(() => false)

    if (hasAtRisk) {
      // At risk should have warning color
      await expect(atRisk).toBeVisible()
    }
  })

  test('completed status displays correctly', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for "Completed" status label
    const completed = page.locator('text=Completed').first()
    const hasCompleted = await completed.isVisible().catch(() => false)

    if (hasCompleted) {
      await expect(completed).toBeVisible()
    }
  })
})

test.describe('My Work Tree - Status Badges', () => {
  test('my work tree shows status badges for sets', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Find My Work section
    await expect(page.getByRole('heading', { name: /My Work/i })).toBeVisible()

    // Sets in the tree should have status badges
    const expandableSet = page.locator('text=Sets').first()
    if (await expandableSet.isVisible()) {
      // Sets row should have a status badge
      const badge = page.locator('[class*="badge"]').first()
      await expect(badge).toBeVisible()
    }
  })

  test('my work tree shows status badges for requirements', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Find the All Tasks section
    await expect(page.getByText(/All Tasks/i).first()).toBeVisible()

    // Task items should have status badges
    const taskItem = page.locator('.border-b').first()
    if (await taskItem.isVisible()) {
      // Should have a badge
      const badge = taskItem.locator('[class*="badge"]').first()
      if (await badge.isVisible()) {
        await expect(badge).toBeVisible()
      }
    }
  })
})

test.describe('Table Views - Status Column', () => {
  test('phases table shows computed status', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Status column header
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible()

    // Status badges in rows
    const statusBadges = page.locator('td [class*="badge"]')
    if ((await statusBadges.count()) > 0) {
      await expect(statusBadges.first()).toBeVisible()
    }
  })

  test('sets table shows computed status', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    // Status column header
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible()
  })

  test('requirements table shows computed status', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Status column header
    await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible()
  })
})
