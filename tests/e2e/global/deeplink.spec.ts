import { expect, test, type Page } from "@playwright/test";

import type { SectionId } from "../../../src/content/story";
import { settle } from "../chrome-helpers";

/**
 * Deep links on first load (plan review focus 5, spec 6.3 and 15). The
 * browser jumps to the hash before any pin exists; after the first
 * ScrollTrigger refresh with real fonts the page re-scrolls to the target.
 * Lazy islands keep mounting after that (the signup form, the trust islands),
 * so the check waits and looks again: the target section's heading must be
 * fully inside the viewport, below the nav, and the target must be the
 * section at the viewport centre or the one the heading starts.
 */

const TARGETS: readonly SectionId[] = ["signup", "film", "route", "roles", "trust"];
const NAV_BOTTOM = 72;

async function landed(page: Page, id: SectionId) {
  return page.evaluate(
    ({ sectionId, navBottom }) => {
      const heading = document.getElementById(`${sectionId}-title`);
      const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      if (!heading || !section) return { ok: false, why: "missing heading or section" };
      const box = heading.getBoundingClientRect();
      const sectionBox = section.getBoundingClientRect();
      const inView = box.top >= navBottom - 8 && box.bottom <= window.innerHeight && box.height > 0;
      const centre = window.innerHeight / 2;
      const owns = sectionBox.top <= centre && sectionBox.bottom > centre;
      return {
        ok: inView && (owns || sectionBox.top >= 0),
        why: `heading ${Math.round(box.top)}-${Math.round(box.bottom)} of ${window.innerHeight}, section ${Math.round(sectionBox.top)}-${Math.round(sectionBox.bottom)}`,
      };
    },
    { sectionId: id, navBottom: NAV_BOTTOM },
  );
}

test.describe("global: deep links on first load", () => {
  for (const id of TARGETS) {
    test(`/#${id} lands with the ${id} heading in view and keeps it there`, async ({ page }) => {
      await page.goto(`/#${id}`);
      await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      await expect.poll(async () => (await landed(page, id)).ok, { message: `/#${id} after load`, timeout: 15_000 }).toBe(true);

      // Lazy islands mount and pins refresh after the first landing: the target must stay put.
      await page.waitForTimeout(2_500);
      await settle(page);
      const after = await landed(page, id);
      expect(after.ok, `/#${id} 2.5s later: ${after.why}`).toBe(true);
      if (id === "signup") await expect(page.locator("#lead-form")).toBeAttached({ timeout: 15_000 });
    });
  }
});
