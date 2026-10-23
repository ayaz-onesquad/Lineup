import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Read environment variables from .env file
 * See https://playwright.dev/docs/test-configuration
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    // Always show failures in console for security tests
    ['list', { printSteps: true }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // ==========================================================================
    // DESIGN-SYSTEM: auth-free foundation checks
    //
    // No storageState and no dependency on `setup`, so this is the one suite
    // that runs without a provisioned tenant. It guards the token pipeline,
    // the 390px overflow rule, touch sizing and the dark-theme variables.
    // ==========================================================================
    {
      name: 'design-system',
      testMatch: /design-system\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // MOBILE-LAYOUT: authenticated pages at phone width against a mocked
    // Supabase (tests/fixtures/mockSupabase.ts). Auth-free like design-system.
    {
      name: 'mobile-layout',
      testMatch: /mobile-layout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // ==========================================================================
    // SETUP PROJECT - Runs auth.setup.ts first to create all auth states
    // ==========================================================================
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      fullyParallel: true, // Run setup blocks in parallel for speed
    },

    // ==========================================================================
    // CHROMIUM-ADMIN: Tests running as SysAdmin (sys_admin role)
    // Uses playwright/.auth/admin.json
    // ==========================================================================
    {
      name: 'chromium-admin',
      testDir: './tests',
      testIgnore: [/security\/.*/, /design-system\.spec\.ts/, /mobile-layout\.spec\.ts/], // security suites and the auth-free suite run in their own projects
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // ==========================================================================
    // CHROMIUM-TENANT: Tests running as Standard Tenant User (org_user role)
    // Uses playwright/.auth/tenant.json
    // ==========================================================================
    {
      name: 'chromium-tenant',
      testDir: './tests',
      testIgnore: [/security\/.*/, /design-system\.spec\.ts/, /mobile-layout\.spec\.ts/], // security suites and the auth-free suite run in their own projects
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/tenant.json',
      },
      dependencies: ['setup'],
    },

    // ==========================================================================
    // SECURITY TESTS: Multi-role security isolation tests
    // These tests specify their own storageState per test.describe block
    // ==========================================================================
    {
      name: 'security-tests',
      testDir: './tests/security',
      use: {
        ...devices['Desktop Chrome'],
        // No default storageState - each test suite sets its own
      },
      dependencies: ['setup'],
    },

    // ==========================================================================
    // LEGACY CHROMIUM: Uses user.json for backwards compatibility
    // ==========================================================================
    {
      name: 'chromium',
      testDir: './tests',
      testIgnore: [/security\/.*/, /design-system\.spec\.ts/, /mobile-layout\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Firefox with user.json (legacy)
    {
      name: 'firefox',
      testDir: './tests',
      testIgnore: [/security\/.*/, /design-system\.spec\.ts/, /mobile-layout\.spec\.ts/],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // WebKit with user.json (legacy)
    {
      name: 'webkit',
      testDir: './tests',
      testIgnore: [/security\/.*/, /design-system\.spec\.ts/, /mobile-layout\.spec\.ts/],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
