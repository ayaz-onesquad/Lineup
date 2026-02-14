/**
 * V2 Features Security Tests
 *
 * Tests unauthenticated access to V2 routes:
 * - /leads - Sales Pipeline
 * - /pitches - Pitches
 * - /templates - Project Templates
 * - /settings/document-catalog - Document Catalog
 *
 * CRITICAL: If any of these tests fail, it indicates a SECURITY VULNERABILITY.
 */

import { test, expect } from '@playwright/test'

// =============================================================================
// Unauthenticated Access Tests for V2 Features
// =============================================================================
test.describe('V2 Features - Unauthenticated Access', () => {
  // Clear auth state to simulate unauthenticated user
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user redirects to login from /leads', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForURL(/\/login/, { timeout: 10000 })

    expect(page.url()).toContain('/login')
  })

  test('unauthenticated user redirects to login from /pitches', async ({ page }) => {
    await page.goto('/pitches')
    await page.waitForURL(/\/login/, { timeout: 10000 })

    expect(page.url()).toContain('/login')
  })

  test('unauthenticated user redirects to login from /templates', async ({ page }) => {
    await page.goto('/templates')
    await page.waitForURL(/\/login/, { timeout: 10000 })

    expect(page.url()).toContain('/login')
  })

  test('unauthenticated user redirects to login from /settings/document-catalog', async ({
    page,
  }) => {
    await page.goto('/settings/document-catalog')
    await page.waitForURL(/\/login/, { timeout: 10000 })

    expect(page.url()).toContain('/login')
  })
})
