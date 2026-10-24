import { test, expect, type Page } from '@playwright/test'
import { installSupabaseMock, MOCK_IDS } from './fixtures/mockSupabase'

/**
 * Mobile layout guard for the authenticated app. See docs/DESIGN-SYSTEM.md.
 *
 * AUTH-FREE like design-system.spec.ts: Supabase is mocked (see
 * fixtures/mockSupabase.ts), so this runs without a tenant or a login and
 * never touches real data. Fixture text is deliberately long.
 *
 * Two failures are checked at phone width:
 *  1. The page scrolls sideways.
 *  2. Content is clipped on the right. The layout hides overflow, so content
 *     wider than the screen is cut off silently instead of scrolling. This
 *     catches the elements that start on screen and end past its right edge,
 *     outside any horizontally scrollable container (a table's own scroll
 *     container is allowed to scroll).
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ''

const LIST_PAGES = [
  '/dashboard', '/clients', '/projects', '/phases', '/sets', '/pitches', '/requirements',
  '/contacts', '/leads', '/competitors', '/documents', '/company-documents', '/notes',
  '/discussions', '/financials', '/passwords', '/templates', '/my-tickets',
  '/settings', '/settings/team', '/settings/security', '/settings/notifications', '/settings/document-catalog',
]

const DETAIL_PAGES = [
  `/clients/${MOCK_IDS.client}`,
  `/projects/${MOCK_IDS.generic(1)}`,
  `/phases/${MOCK_IDS.generic(2)}`,
  `/pitches/${MOCK_IDS.pitches[0]}`,
  `/requirements/${MOCK_IDS.requirements[0]}`,
  `/contacts/${MOCK_IDS.generic(3)}`,
  `/leads/${MOCK_IDS.generic(4)}`,
  `/competitors/${MOCK_IDS.generic(5)}`,
  `/documents/${MOCK_IDS.generic(6)}`,
  `/notes/${MOCK_IDS.generic(7)}`,
  `/discussions/${MOCK_IDS.generic(8)}`,
  `/financials/${MOCK_IDS.generic(9)}`,
  `/passwords/${MOCK_IDS.generic(10)}`,
  `/company-documents/${MOCK_IDS.generic(11)}`,
]

const WIDTHS = [
  { width: 390, height: 844 }, // iPhone 14/15
  { width: 360, height: 780 }, // small Android
]

async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    // Allowed: inside a horizontal scroll container (a table's own scroller),
    // or inside text deliberately truncated with an ellipsis.
    const insideScroller = (el: Element) => {
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a)
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && a.scrollWidth > a.clientWidth + 1) return true
        if (s.textOverflow === 'ellipsis' && s.overflowX === 'hidden') return true
      }
      return false
    }
    const clipped: string[] = []
    for (const el of Array.from(document.querySelectorAll('main *'))) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.right <= vw + 1 || r.left >= vw) continue
      if (insideScroller(el)) continue
      // Decorative layers (glows, gradients) are not content.
      if (el.closest('[aria-hidden="true"]')) continue
      // Report the outermost offender only.
      const parent = el.parentElement?.getBoundingClientRect()
      if (parent && parent.right > vw + 1) continue
      const text = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)
      clipped.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 80)}"> "${text}" right=${Math.round(r.right)}`)
    }
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped }
  })
}

/**
 * Containers that hide overflow while their content is wider than they are,
 * i.e. content the user cannot reach: no scrollbar and no ellipsis. Width
 * independent, so it also catches clipping inside cards and panels on
 * tablets and desktops.
 */
async function silentlyClipped(page: Page) {
  return page.evaluate(() => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('main *'))) {
      const s = getComputedStyle(el)
      if (!(s.overflowX === 'hidden' || s.overflowX === 'clip') || s.textOverflow === 'ellipsis') continue
      const r = el.getBoundingClientRect()
      if (r.width < 40 || r.height < 10 || el.scrollWidth <= el.clientWidth + 2) continue
      if (el.closest('.sr-only, [role=progressbar], [aria-hidden=true]')) continue
      const hides = Array.from(el.querySelectorAll('*')).some(c => {
        const cr = c.getBoundingClientRect()
        const cs = getComputedStyle(c)
        return (
          cr.width > 0 && cr.left < r.right && cr.right > r.right + 2 &&
          ((c as HTMLElement).innerText || '').trim() !== '' &&
          cs.visibility !== 'hidden' && cs.opacity !== '0'
        )
      })
      if (hides) {
        const text = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)
        out.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 80)}"> "${text}" box=${Math.round(r.width)} content=${el.scrollWidth}`)
      }
    }
    return out
  })
}

/**
 * HARD RULE: text never overflows its section. Finds text drawn outside the
 * nearest card / bordered / filled box that contains it (an email running past
 * the card edge). Text inside a scroll container or an ellipsis-truncated
 * element is exempt: it is reachable or deliberately shortened.
 */
async function textOutsideSection(page: Page) {
  return page.evaluate(() => {
    const isSection = (el: Element) => {
      const s = getComputedStyle(el)
      const bordered = (['Left', 'Right'] as const).some(
        side => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== 'none'
      )
      const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
      return bordered || filled
    }
    const exempt = (el: Element) => {
      for (let a: Element | null = el; a; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true
        if (s.textOverflow === 'ellipsis' && s.overflowX === 'hidden') return true
      }
      return false
    }
    const out: string[] = []
    const root = document.querySelector('main')
    if (!root) return out
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const el = node.parentElement
      if (!node.textContent?.trim() || !el || el.closest('.sr-only, [aria-hidden=true]') || exempt(el)) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = Array.from(range.getClientRects()).filter(r => r.width > 0)
      if (!rects.length) continue
      let box: Element | null = null
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (isSection(a)) { box = a; break }
      }
      const limit = box ? box.getBoundingClientRect() : { left: 0, right: window.innerWidth }
      const right = Math.max(...rects.map(r => r.right))
      const left = Math.min(...rects.map(r => r.left))
      if (right > limit.right + 1 || left < limit.left - 1) {
        out.push(`"${node.textContent.trim().slice(0, 40)}" spans ${Math.round(left)}–${Math.round(right)}px, section ${Math.round(limit.left)}–${Math.round(limit.right)}px`)
      }
    }
    return out
  })
}

async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/-]/g, '\\$&')}$`))
  if (await page.getByText('Something went wrong').count()) {
    test.skip(true, `${path} hit its error boundary on mock data; extend fixtures/mockSupabase.ts`)
  }
}

test.describe('Authenticated pages fit a phone screen', () => {
  test.skip(!SUPABASE_URL, 'VITE_SUPABASE_URL is required to route the mock')

  test.beforeEach(async ({ context }) => {
    await installSupabaseMock(context, SUPABASE_URL)
  })

  for (const viewport of WIDTHS) {
    test.describe(`${viewport.width}px`, () => {
      test.use({ viewport })

      for (const path of [...LIST_PAGES, ...DETAIL_PAGES]) {
        test(`${path} has no sideways scroll or clipped content`, async ({ page }) => {
          await open(page, path)
          const { overflow, clipped } = await measure(page)
          expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
          expect(clipped, `${path} has content cut off on the right`).toEqual([])
        })
      }

      test('dashboard My Work tree fits when fully expanded', async ({ page }) => {
        await open(page, '/dashboard')
        // Expand every collapsed node inside the page (not the nav drawer).
        for (let pass = 0; pass < 3; pass++) {
          for (const node of await page.locator('main [aria-expanded="false"]:visible').all()) {
            await node.click({ timeout: 1000 }).catch(() => {})
          }
        }
        const { overflow, clipped } = await measure(page)
        expect(overflow).toBeLessThanOrEqual(1)
        expect(clipped, 'My Work rows are cut off on the right').toEqual([])
      })
    })
  }
})

test.describe('No content is cut off without a way to reach it', () => {
  test.skip(!SUPABASE_URL, 'VITE_SUPABASE_URL is required to route the mock')

  test.beforeEach(async ({ context }) => {
    await installSupabaseMock(context, SUPABASE_URL)
  })

  for (const width of [390, 768, 1024, 1280]) {
    test.describe(`${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      for (const path of [...LIST_PAGES, ...DETAIL_PAGES]) {
        test(`${path} has no silently clipped content`, async ({ page }) => {
          await open(page, path)
          if (path === '/dashboard') {
            for (const node of await page.locator('main [aria-expanded="false"]:visible').all()) {
              await node.click({ timeout: 1000 }).catch(() => {})
            }
          }
          expect(await silentlyClipped(page), `${path} hides content with no scrollbar`).toEqual([])
          expect(await textOutsideSection(page), `${path} has text overflowing its section`).toEqual([])
        })
      }
    })
  }
})
