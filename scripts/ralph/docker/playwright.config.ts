/**
 * Playwright configuration for headless E2E testing in Ralph Docker environment
 *
 * This config is optimized for running in a containerized CI environment:
 * - Uses Chromium only (pre-installed in Docker image)
 * - Headless mode by default
 * - Configured for the Docker network
 *
 * To use in a story:
 * 1. Install playwright: npm install -D @playwright/test
 * 2. Copy this config to customer/playwright.config.ts
 * 3. Add test scripts to package.json
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    // Base URL for the app running in Docker
    baseURL: process.env.BASE_URL || "http://localhost:3000",

    // Collect trace on failure for debugging
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Headless mode for Docker
    headless: true,

    // Longer timeouts for CI
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the pre-installed Chromium in Docker
        channel: undefined,
        launchOptions: {
          executablePath: process.env.CHROME_BIN || "/usr/bin/chromium-browser",
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      },
    },
  ],

  // Web server configuration (if running app in same container)
  webServer: process.env.START_SERVER
    ? {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      }
    : undefined,
});
