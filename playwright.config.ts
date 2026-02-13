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
      testIgnore: /security\/.*/, // Security tests have their own auth handling
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
      testIgnore: /security\/.*/, // Security tests have their own auth handling
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
      testIgnore: /security\/.*/, // Security tests run separately
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
      testIgnore: /security\/.*/,
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
      testIgnore: /security\/.*/,
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
