import { test, expect } from '@playwright/test'

/**
 * V2 Dashboard & My Work Tests
 *
 * Tests for the new unified dashboard features:
 * - My Work KPI cards (Sets, Pitches, Tasks, Requirements)
 * - Priority Tasks section
 * - My Work unified section
 */

test.describe('Dashboard - My Work KPI Cards', () => {
  test('dashboard loads with welcome message', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show welcome heading
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()
  })

  test('dashboard displays all 4 KPI cards', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show all 4 KPI cards
    await expect(page.getByText(/My Sets/i).first()).toBeVisible()
    await expect(page.getByText(/My Pitches/i).first()).toBeVisible()
    await expect(page.getByText(/My Tasks/i).first()).toBeVisible()
    await expect(page.getByText(/My Requirements/i).first()).toBeVisible()
  })

  test('KPI cards show active count', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show "active" text in KPI cards (indicates data is loaded)
    await expect(page.getByText(/active/i).first()).toBeVisible()
  })

  test('dashboard shows Priority Tasks section', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show Priority Tasks card
    await expect(page.getByText(/Priority Tasks/i).first()).toBeVisible()
  })

  test('dashboard shows My Work section', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show My Work card
    await expect(page.getByRole('heading', { name: /My Work/i })).toBeVisible()
  })

  test('dashboard My Work section loads', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // The My Work section should always be visible once dashboard loads
    await expect(page.getByRole('heading', { name: /My Work/i })).toBeVisible({ timeout: 15000 })
  })

  test('dashboard KPI cards display metrics', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Wait for KPI cards to show "active" text (indicates data has loaded)
    await expect(page.getByText(/active/i).first()).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Dashboard - Navigation', () => {
  test('can navigate to sets page from sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Click sets in sidebar
    await page.getByRole('link', { name: /Sets/i }).first().click()

    await expect(page).toHaveURL(/\/sets/, { timeout: 15000 })
  })

  test('can navigate to pitches page from sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Click pitches in sidebar
    await page.getByRole('link', { name: /Pitches/i }).first().click()

    await expect(page).toHaveURL(/\/pitches/, { timeout: 15000 })
  })

  test('can navigate to requirements page from sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    // Click requirements in sidebar
    await page.getByRole('link', { name: /Requirements/i }).first().click()

    await expect(page).toHaveURL(/\/requirements/, { timeout: 15000 })
  })
})

test.describe('Dashboard - Responsiveness', () => {
  test('KPI cards stack on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should still show KPI cards
    await expect(page.getByText(/My Sets/i).first()).toBeVisible()
    await expect(page.getByText(/My Pitches/i).first()).toBeVisible()
  })

  test('dashboard works on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should show all content
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /My Work/i })).toBeVisible()
  })
})
