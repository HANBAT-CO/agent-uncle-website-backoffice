import { defineConfig, devices } from "@playwright/test";

/**
 * Console e2e suites (tests/e2e-admin), against the LOCAL Supabase stack only
 * (supabase-local, port 55321; global-setup fails fast when it is down).
 * One desktop Chromium project at 1440x900, Korean locale, Seoul time, one
 * worker: the specs share seeded data and some mutate and restore it.
 *
 * The web server is the same shared `next dev` on port 3100 as
 * playwright.config.ts (LEAD_DRY_RUN=1), so only one dev server runs; it
 * serves /admin once .env.development.local holds the BACKOFFICE_* block.
 * Override the target with PLAYWRIGHT_BASE_URL.
 */

const PORT = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? `.context/playwright/admin-${Date.now()}-${process.pid}`;

export default defineConfig({
  testDir: "tests/e2e-admin",
  outputDir,
  globalSetup: "./tests/e2e-admin/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `LEAD_DRY_RUN=1 npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { LEAD_DRY_RUN: "1" },
      },
});
