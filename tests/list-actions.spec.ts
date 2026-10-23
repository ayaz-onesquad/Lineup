import { test, expect } from '@playwright/test'
import * as XLSX from 'xlsx'
import fs from 'fs'
import { installSupabaseMock } from './fixtures/mockSupabase'

/**
 * Every overview page offers the same list actions: Export to Excel and
 * multi-select with bulk delete. Runs against the mocked Supabase (see
 * fixtures/mockSupabase.ts), so it needs no login and deletes nothing real.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''

/** Pages whose list supports both export and bulk delete. */
const EXPORT_AND_DELETE = [
  '/clients', '/projects', '/phases', '/sets', '/pitches', '/requirements', '/contacts',
  '/competitors', '/documents', '/company-documents', '/notes', '/financials', '/passwords',
]
/** Export only: no delete exists for these records. */
const EXPORT_ONLY = ['/settings/team', '/my-tickets', '/settings/document-catalog']

test.describe('Overview list actions', () => {
  test.skip(!SUPABASE_URL, 'VITE_SUPABASE_URL is required to route the mock')

  test.beforeEach(async ({ context }) => {
    await installSupabaseMock(context, SUPABASE_URL)
  })

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test.describe(`${viewport.width}px`, () => {
      test.use({ viewport })

      for (const path of [...EXPORT_AND_DELETE, ...EXPORT_ONLY]) {
        test(`${path} exports the list to Excel`, async ({ page }) => {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          const exportButton = page.getByRole('button', { name: /^Export/ }).first()
          await expect(exportButton).toBeVisible()

          const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()])
          expect(download.suggestedFilename()).toMatch(/\.xlsx$/)

          const file = await download.path()
          const book = XLSX.read(fs.readFileSync(file!), { type: 'buffer' })
          const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1 })
          expect(rows.length, 'header row plus at least one record').toBeGreaterThan(1)
          expect(rows[0].filter(Boolean).length, 'named columns').toBeGreaterThan(1)
          // Nothing an end user should never see in a spreadsheet.
          expect(JSON.stringify(rows)).not.toMatch(/\[object Object\]/)
        })
      }

      for (const path of EXPORT_AND_DELETE) {
        test(`${path} can select records and offers bulk delete`, async ({ page }) => {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          const rowBox = page.getByRole('checkbox', { name: /select (row|record)/i }).first()
          await expect(rowBox).toBeVisible()
          await rowBox.click()
          await expect(page.getByRole('button', { name: /^Delete 1 /i })).toBeVisible()
        })
      }
    })
  }
})
