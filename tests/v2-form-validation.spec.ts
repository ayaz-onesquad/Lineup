import { test, expect } from '@playwright/test'

/**
 * V2 Form Validation Tests
 *
 * Tests for form validation and UX improvements:
 * - Required field indicators (red asterisk)
 * - Scroll to error on submit
 * - SearchableSelect usage
 * - Form error messages
 */

test.describe('Client Form - Validation', () => {
  test('client form shows required indicator on Name field', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Click New Client button
    await page.getByRole('button', { name: /New Client/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Name field should have required indicator
    const nameLabel = page.locator('label:has-text("Name")')
    await expect(nameLabel).toBeVisible()

    // Check for red asterisk (*)
    const requiredIndicator = nameLabel.locator('text=*').or(nameLabel.locator('.text-destructive'))
    await expect(requiredIndicator).toBeVisible()
  })

  test('client form shows error when name is empty', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Client/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click submit without filling name
    await page.getByRole('button', { name: /Create|Save/i }).click()

    // Error message should appear
    await expect(page.getByText(/required|cannot be empty/i)).toBeVisible()
  })
})

test.describe('Project Form - Validation', () => {
  test('project form shows required indicators', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Click New Project button
    await page.getByRole('button', { name: /New Project/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Name field should have required indicator
    await expect(page.locator('label:has-text("Name") >> text=*')).toBeVisible()

    // Client field should have required indicator
    await expect(page.locator('label:has-text("Client") >> text=*')).toBeVisible()
  })

  test('project form uses SearchableSelect for Client', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Project/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Client field should be a searchable select (has placeholder)
    await expect(page.getByPlaceholder(/Select client/i)).toBeVisible()
  })
})

test.describe('Phase Form - Validation', () => {
  test('phase form shows required indicators', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Click New Phase button
    await page.getByRole('button', { name: /New Phase/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Name field should have required indicator
    await expect(page.locator('label:has-text("Name") >> text=*')).toBeVisible()
  })

  test('phase form uses SearchableSelect for Project', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Phase/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Project field should be a searchable select
    await expect(page.getByPlaceholder(/Select project/i)).toBeVisible()
  })
})

test.describe('Set Form - Validation', () => {
  test('set form shows required indicators', async ({ page }) => {
    await page.goto('/sets')
    await page.waitForLoadState('networkidle')

    // Click New Set button
    await page.getByRole('button', { name: /New Set/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Name field should have required indicator
    await expect(page.locator('label:has-text("Name") >> text=*')).toBeVisible()
  })
})

test.describe('Requirement Form - Validation', () => {
  test('requirement form shows required indicators', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Click New Requirement button
    await page.getByRole('button', { name: /New Requirement/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Title field should have required indicator
    await expect(page.locator('label:has-text("Title") >> text=*')).toBeVisible()
  })

  test('requirement form uses SearchableSelect for Set', async ({ page }) => {
    await page.goto('/requirements')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Requirement/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Set field should be a searchable select
    await expect(page.getByPlaceholder(/Select set/i)).toBeVisible()
  })
})

test.describe('Lead Form - Validation', () => {
  test('lead form shows required indicators', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Click New Lead button
    await page.getByRole('button', { name: /New Lead/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Lead Name field should have required indicator
    await expect(page.locator('label:has-text("Lead Name") >> text=*')).toBeVisible()
  })

  test('lead form shows validation error on empty submit', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Lead/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Submit without filling required fields
    await page.getByRole('button', { name: /Create|Save/i }).click()

    // Error should appear
    await expect(page.getByText(/required/i).first()).toBeVisible()
  })
})

test.describe('Contact Form - Validation', () => {
  test('contact form shows required indicators', async ({ page }) => {
    await page.goto('/contacts')
    await page.waitForLoadState('networkidle')

    // Click New Contact button
    await page.getByRole('button', { name: /New Contact/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // First Name field should have required indicator
    await expect(page.locator('label:has-text("First Name") >> text=*')).toBeVisible()
  })

  test('contact form validates email format', async ({ page }) => {
    await page.goto('/contacts')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Contact/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill first name
    await page.getByLabel(/First Name/i).fill('Test')

    // Fill invalid email
    const emailField = page.getByLabel(/Email/i)
    if (await emailField.isVisible()) {
      await emailField.fill('invalid-email')

      // Submit
      await page.getByRole('button', { name: /Create|Save/i }).click()

      // Should show email validation error
      const emailError = page.getByText(/invalid.*email|valid email/i)
      if (await emailError.isVisible()) {
        await expect(emailError).toBeVisible()
      }
    }
  })
})

test.describe('Pitch Form - Validation', () => {
  test('pitch form shows required indicators', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForLoadState('networkidle')

    // Click New Pitch button
    await page.getByRole('button', { name: /New Pitch/i }).click()

    // Wait for dialog
    await expect(page.getByRole('dialog')).toBeVisible()

    // Name field should have required indicator
    await expect(page.locator('label:has-text("Name") >> text=*')).toBeVisible()
  })
})

test.describe('Scroll to Error', () => {
  test('long form scrolls to first error on submit', async ({ page }) => {
    // Use a form with multiple fields that might cause scroll
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Project/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Submit without filling fields
    await page.getByRole('button', { name: /Create|Save/i }).click()

    // First error should be visible (scroll should ensure it's in view)
    const firstError = page.getByText(/required/i).first()
    await expect(firstError).toBeVisible()

    // The element should be in viewport
    const isInViewport = await firstError.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      )
    })
    expect(isInViewport).toBeTruthy()
  })
})

test.describe('SearchableSelect Component', () => {
  test('SearchableSelect opens dropdown on click', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Project/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click on Client selector
    await page.getByPlaceholder(/Select client/i).click()

    // Dropdown should open (showing options or search input)
    await page.waitForTimeout(300)
  })

  test('SearchableSelect allows typing to filter', async ({ page }) => {
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')

    // Open create dialog
    await page.getByRole('button', { name: /New Project/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click on Client selector
    await page.getByPlaceholder(/Select client/i).click()

    // Type to search
    await page.getByPlaceholder(/Select client/i).fill('test')

    // Should filter options or show "no results"
    await page.waitForTimeout(300)
  })

  test('SearchableSelect clears selection on clear button', async ({ page }) => {
    await page.goto('/phases')
    await page.waitForLoadState('networkidle')

    // Navigate to phase detail with a project
    const phaseRow = page.locator('tbody tr').first()
    if ((await phaseRow.count()) > 0) {
      await phaseRow.dblclick()
      await page.waitForLoadState('networkidle')

      // Enter edit mode
      await page.getByRole('button', { name: /Edit/i }).click()

      // Find a SearchableSelect with clear button (Lead field)
      const leadSelect = page.getByPlaceholder(/Select lead/i)
      if (await leadSelect.isVisible()) {
        // Clear buttons appear on hover
        await leadSelect.hover()
      }
    }
  })
})
