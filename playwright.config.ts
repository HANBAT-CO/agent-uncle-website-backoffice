import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suites (tests/e2e). Three projects, as every package's spec runs:
 * - desktop: Chromium 1440x900
 * - mobile: WebKit 390x844, touch, mobile viewport (iPhone Safari engine)
 * - reduced-motion: Chromium 1440x900 with prefers-reduced-motion: reduce
 *
 * The web server is the shared `next dev` on port 3100 with LEAD_DRY_RUN=1
 * (the lead action validates and returns success without inserting). Locally
 * an already running server on 3100 is reused. Override the target with
 * PLAYWRIGHT_BASE_URL.
 */

const PORT = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR ?? `.context/playwright/${Date.now()}-${process.pid}`;

export default defineConfig({
  testDir: "tests/e2e",
  outputDir,
  fullyParallel: true,
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
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "reduced-motion",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
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
