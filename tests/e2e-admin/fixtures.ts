import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { test as base, expect, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

import { REPO_ROOT, STAFF, type StaffRole } from "./helpers/rest";

export { expect };
export type { StaffRole };

/** Cached signed-in states, one per role; global-setup clears them on every run. */
export const STATE_DIR = path.join(REPO_ROOT, ".context/playwright/admin-state");

/** Signs in through the local password form and waits until the app leaves the login page. */
export async function loginThroughUi(page: Page, role: StaffRole, next?: string): Promise<void> {
  const query = next === undefined ? "" : `?next=${encodeURIComponent(next)}`;
  await page.goto(`/admin/login${query}`);
  await page.getByLabel("이메일").fill(STAFF[role].email);
  await page.getByLabel("비밀번호").fill(STAFF[role].password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
}

type AdminFixtures = {
  /**
   * A page in a new browser context signed in as `role` (owner, operator,
   * viewer, or spare@, who is not staff). The first call per role and run
   * logs in through the UI and caches the storageState.
   */
  asRole: (role: StaffRole) => Promise<Page>;
};

export const test = base.extend<AdminFixtures>({
  asRole: async ({ browser, baseURL, locale, timezoneId, viewport }, provide) => {
    const options: BrowserContextOptions = { baseURL, locale, timezoneId, viewport };
    const contexts: BrowserContext[] = [];

    await provide(async (role) => {
      const file = path.join(STATE_DIR, `${role}.json`);
      if (!existsSync(file)) {
        mkdirSync(STATE_DIR, { recursive: true });
        const loginContext = await browser.newContext(options);
        try {
          await loginThroughUi(await loginContext.newPage(), role);
          await loginContext.storageState({ path: file });
        } finally {
          await loginContext.close();
        }
      }
      const context = await browser.newContext({ ...options, storageState: file });
      contexts.push(context);
      return context.newPage();
    });

    for (const context of contexts) await context.close();
  },
});
