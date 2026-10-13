import { test, expect } from '@playwright/test'

/**
 * Design system regression guard. See docs/DESIGN-SYSTEM.md.
 *
 * Deliberately AUTH-FREE: it runs against the public auth pages, so it works
 * without a provisioned tenant and without touching tenant data. That makes it
 * the one suite that can run in any environment.
 *
 * It covers the foundations rather than individual pages: the token pipeline,
 * the 390px overflow rule, touch-target sizing and the dark-theme variables.
 * Those are the things that, when broken, break every screen at once.
 */

const PHONE = { width: 390, height: 844 } // iPhone 14/15 logical size

/** Pages reachable without a session. */
const PUBLIC_PAGES = ['/login', '/forgot-password']

// ---------------------------------------------------------------------------
// 1. No horizontal page scroll at 390px (section 2.2)
// ---------------------------------------------------------------------------

test.describe('No horizontal overflow at 390px', () => {
  test.use({ viewport: PHONE })

  for (const path of PUBLIC_PAGES) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      // 1px of slack for sub-pixel rounding.
      expect(
        scrollWidth,
        `${path} overflows by ${scrollWidth - clientWidth}px at 390px`
      ).toBeLessThanOrEqual(clientWidth + 1)
    })
  }

  test('no single element is wider than the viewport', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const offenders = await page.evaluate(() => {
      const out: { tag: string; cls: string; width: number }[] = []
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect()
        // Ignore zero-size and off-screen portal content.
        if (r.width > window.innerWidth + 1 && r.height > 0) {
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') ?? '').slice(0, 80),
            width: Math.round(r.width),
          })
        }
      })
      return out
    })

    expect(offenders, `elements wider than 390px: ${JSON.stringify(offenders)}`).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Design tokens actually compile (section 2.4, 2.6)
//
// These assert the Tailwind config reaches the browser. A typo in the config
// silently produces no class at all, which is invisible in code review.
// ---------------------------------------------------------------------------

test.describe('Design tokens compile', () => {
  test('row density and touch tokens resolve to the documented sizes', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const measured = await page.evaluate(() => {
      const probe = (cls: string, prop: string) => {
        const el = document.createElement('div')
        el.className = cls
        document.body.appendChild(el)
        const value = getComputedStyle(el).getPropertyValue(prop)
        el.remove()
        return value
      }
      return {
        rowCompact: probe('h-row-compact', 'height'),
        rowComfortable: probe('h-row-comfortable', 'height'),
        rowSpacious: probe('h-row-spacious', 'height'),
        minTouch: probe('min-h-touch', 'min-height'),
        minTouchLg: probe('min-h-touch-lg', 'min-height'),
        maxContent: probe('max-w-content', 'max-width'),
      }
    })

    expect(measured.rowCompact).toBe('44px')
    expect(measured.rowComfortable).toBe('56px')
    expect(measured.rowSpacious).toBe('64px')
    expect(measured.minTouch).toBe('44px')
    expect(measured.minTouchLg).toBe('48px')
    expect(measured.maxContent).toBe('1600px')
  })

  test('status colours are HSL variables, so the opacity modifier works', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const result = await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'bg-warning/10 text-success'
      document.body.appendChild(el)
      const style = getComputedStyle(el)
      const out = { bg: style.backgroundColor, color: style.color }
      el.remove()
      return out
    })

    // A hex token cannot express /10, so it would come back fully opaque or
    // transparent. An HSL variable yields a real alpha channel.
    expect(result.bg).toMatch(/^rgba?\(/)
    expect(result.bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(result.color).not.toBe('rgba(0, 0, 0, 0)')
  })
})

// ---------------------------------------------------------------------------
// 3. Dark theme variables ship (section 2.5)
//
// Regression guard for a real bug: the `.dark` block sat inside `@layer base`,
// where Tailwind tree-shook it out of every build. The `dark:` utilities
// compiled while the custom properties they reference did not.
// ---------------------------------------------------------------------------

test('dark theme custom properties are present and differ from light', async ({ page }) => {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  const tokens = ['--background', '--foreground', '--muted-foreground', '--success', '--border']

  const result = await page.evaluate(names => {
    const read = () =>
      Object.fromEntries(
        names.map(n => [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()])
      )
    const light = read()
    document.documentElement.classList.add('dark')
    const dark = read()
    document.documentElement.classList.remove('dark')
    return { light, dark }
  }, tokens)

  for (const token of tokens) {
    expect(result.light[token], `${token} missing in light theme`).not.toBe('')
    expect(result.dark[token], `${token} missing in dark theme`).not.toBe('')
    expect(
      result.dark[token],
      `${token} is identical in both themes, so the .dark block is not being applied`
    ).not.toBe(result.light[token])
  }
})

// ---------------------------------------------------------------------------
// 4. Touch targets on real touch input (section 2.4)
//
// The `coarse:` variant keys off `pointer: coarse`, so this needs a device
// descriptor with touch rather than just a narrow viewport.
// ---------------------------------------------------------------------------

test.describe('Touch targets', () => {
  // A full device descriptor cannot be scoped to a describe block (it would
  // force a different browser type). These three options give a coarse pointer
  // without changing the browser.
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

  test('the primary action is at least 44px tall on touch', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
    expect(coarse, 'expected a coarse pointer under the iPhone descriptor').toBe(true)

    const submit = page.getByRole('button', { name: /sign in/i })
    await expect(submit).toBeVisible()

    const box = await submit.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height, 'primary button below the 44px touch minimum').toBeGreaterThanOrEqual(44)
  })
})

// ---------------------------------------------------------------------------
// 5. The session-security additions are actually on the login page
// ---------------------------------------------------------------------------

test.describe('Login page session controls', () => {
  test.use({ viewport: PHONE })

  test('offers "Keep me signed in" and explains the idle timeout', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    await expect(page.getByLabel(/keep me signed in/i)).toBeVisible()
    await expect(page.getByText(/signed out automatically after a period of inactivity/i))
      .toBeVisible()
  })

  test('password field accepts input and toggles visibility', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const password = page.getByPlaceholder(/enter your password/i)
    await password.fill('  secret-with-spaces  ')
    await expect(password).toHaveAttribute('type', 'password')

    // The eye toggle is the only unlabelled button inside the field wrapper.
    await password.locator('xpath=following-sibling::button').first().click()
    await expect(password).toHaveAttribute('type', 'text')
  })
})
