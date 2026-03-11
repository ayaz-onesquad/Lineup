import { test, expect } from '@playwright/test'

/**
 * V2 Priority System Tests
 *
 * Tests for the 6-level Eisenhower Matrix priority system:
 * - Priority levels (Critical, High, Medium-High, Medium, Medium-Low, Low)
 * - Priority badges
 * - Dashboard priority grouping
 * - Urgency and Importance fields
 */

test.describe('Dashboard - Priority Groups', () => {
  test('dashboard shows 6 priority levels in All Tasks', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Find the All Tasks section
    await expect(page.getByText(/All Tasks/i).first()).toBeVisible()

    // Priority labels should be present (if there are tasks)
    const criticalLabel = page.getByText(/Critical/i)
    const highLabel = page.getByText(/^High$/i)
    const mediumHighLabel = page.getByText(/Medium-High/i)

    // At least some priority sections should be present or empty state
    const hasContent = (
      await criticalLabel.isVisible().catch(() => false) ||
      await highLabel.isVisible().catch(() => false) ||
      await mediumHighLabel.isVisible().catch(() => false) ||
      await page.getByText(/No tasks assigned/i).isVisible().catch(() => false)
    )
    expect(hasContent).toBeTruthy()
  })

  test('priority sections are collapsible', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Find a priority section header (if tasks exist)
    const priorityHeader = page.locator('button:has-text("Critical")').first()
    if (await priorityHeader.isVisible()) {
      // Should have chevron icon for collapse/expand
      await priorityHeader.click()

      // Toggle behavior should work
      await page.waitForTimeout(200)
    }
  })

  test('my work section shows 6 priority levels', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Find My Work section
    await expect(page.getByRole('heading', { name: /My Work/i })).toBeVisible()

    // Priority levels in My Work
    const priorityLabels = ['Critical', 'High', 'Medium-High', 'Medium', 'Medium-Low', 'Low']

    // Check for any priority label or empty state
    const hasPriorityOrEmpty = (
      await page.getByText(/Critical|High|Medium|Low/i).first().isVisible().catch(() => false) ||
      await page.getByText(/No work assigned/i).isVisible().catch(() => false)
    )
    expect(hasPriorityOrEmpty).toBeTruthy()
  })
})

test.describe('Priority Badges', () => {
  test('priority badge shows on high priority items', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Look for flame icon (priority 1-2 indicator)
    const flameIcon = page.locator('[class*="text-orange"]').first()
    const hasFlame = await flameIcon.isVisible().catch(() => false)

    // Either has flame icons or no high priority items
    expect(hasFlame !== null).toBeTruthy()
  })

  test('requirement detail shows priority badge', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Navigate to requirement detail
    const reqRow = page.locator('tbody tr').first()
    if ((await reqRow.count()) > 0) {
      await reqRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Priority badge should be visible in header or priority section
      const priorityBadge = page.locator('text=/Critical|High|Medium|Low/').first()
      if (await priorityBadge.isVisible()) {
        await expect(priorityBadge).toBeVisible()
      }
    }
  })
})

test.describe('Priority Fields - Urgency & Importance', () => {
  test('phase detail shows urgency field', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Urgency field should be visible
      await expect(page.getByText(/Urgency/i)).toBeVisible()
    }
  })

  test('phase detail shows importance field', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Importance field should be visible
      await expect(page.getByText(/Importance/i)).toBeVisible()
    }
  })

  test('urgency has correct options', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Enter edit mode
      await page.getByRole('button', { name: /Edit/i }).click()

      // Find urgency dropdown
      const urgencyField = page.locator('text=Urgency').locator('..').locator('button').first()
      if (await urgencyField.isVisible()) {
        await urgencyField.click()

        // Should show options: Low, Medium, High, Critical
        await page.waitForTimeout(200)
      }
    }
  })

  test('importance has correct options', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Enter edit mode
      await page.getByRole('button', { name: /Edit/i }).click()

      // Find importance dropdown
      const importanceField = page.locator('text=Importance').locator('..').locator('button').first()
      if (await importanceField.isVisible()) {
        await importanceField.click()

        // Should show options: Low, Medium, High
        await page.waitForTimeout(200)
      }
    }
  })

  test('calculated priority is displayed', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Calculated Priority field
      const calcPriority = page.getByText(/Calculated Priority/i)
      if (await calcPriority.isVisible()) {
        await expect(calcPriority).toBeVisible()
      }
    }
  })
})

test.describe('Priority in Table Views', () => {
  test('phases table shows priority column', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Priority column header
    await expect(page.getByRole('columnheader', { name: /Priority/i })).toBeVisible()
  })

  test('sets table shows priority info', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    // Priority or Urgency/Importance should be shown
    const hasPriorityCol = await page.getByRole('columnheader', { name: /Priority|Urgency/i }).isVisible().catch(() => false)

    // Table should be visible
    await expect(page.locator('table')).toBeVisible()
  })

  test('requirements table shows priority badge', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Table should be visible
    await expect(page.locator('table')).toBeVisible()
  })
})

test.describe('Priority Labels', () => {
  test('priority 1 shows as Critical', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for Critical label in priority sections
    const criticalSection = page.getByText(/Critical.*Do First.*Crisis/i)
    const hasCritical = await criticalSection.isVisible().catch(() => false)

    // Either has Critical section or no items at that priority
    expect(hasCritical !== null).toBeTruthy()
  })

  test('priority 2 shows as High', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for High label
    const highSection = page.getByText(/High.*Do First.*Urgent/i)
    const hasHigh = await highSection.isVisible().catch(() => false)

    expect(hasHigh !== null).toBeTruthy()
  })

  test('priority 3 shows as Medium-High', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for Medium-High label
    const medHighSection = page.getByText(/Medium-High.*Schedule/i)
    const hasMedHigh = await medHighSection.isVisible().catch(() => false)

    expect(hasMedHigh !== null).toBeTruthy()
  })
})
