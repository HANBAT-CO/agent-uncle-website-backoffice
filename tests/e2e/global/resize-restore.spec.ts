import { expect, test, type Page } from "@playwright/test";

import type { SectionId } from "../../../src/content/story";
import { openPage, settle } from "../chrome-helpers";

const WIDE = { width: 1440, height: 900 };
const BELOW_MOTION_BREAKPOINT = { width: 900, height: 900 };
const TARGETS = ["roles", "trust", "film", "signup"] as const satisfies readonly SectionId[];

async function afterResize(page: Page): Promise<void> {
  await page.waitForTimeout(1_200);
  await settle(page);
  await page.waitForTimeout(300);
}

async function centreSection(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const centre = window.innerHeight / 2;
    for (const section of document.querySelectorAll<HTMLElement>("[data-section]")) {
      const box = section.getBoundingClientRect();
      if (box.top <= centre && box.bottom > centre) return section.dataset.section ?? null;
    }
    return null;
  });
}

async function parkInSection(page: Page, id: SectionId): Promise<void> {
  const land = async () => {
    await page.evaluate((sectionId) => {
      const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      if (!section) throw new Error(`missing section ${sectionId}`);
      const box = section.getBoundingClientRect();
      const top = box.top + window.scrollY;
      const target = top + box.height * 0.45 - window.innerHeight / 2;
      const hook = (window as Window & { __auScrollTo?: (top: number) => void }).__auScrollTo;
      if (typeof hook === "function") hook(Math.max(0, Math.round(target)));
      else window.scrollTo({ top: Math.max(0, Math.round(target)), behavior: "instant" });
    }, id);
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await land();
    await settle(page);
    await page.waitForTimeout(700);
    if ((await centreSection(page)) === id) return;
  }
}

test.describe("global: resize restore across the motion breakpoint", () => {
  test.setTimeout(180_000);

  test("1440 to 900 to 1440 keeps the reader in the same section", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "this regression crosses from desktop motion to the no-pin branch");

    await page.setViewportSize(WIDE);
    await openPage(page);
    await afterResize(page);

    for (const id of TARGETS) {
      await parkInSection(page, id);
      expect(await centreSection(page), `${id}: parked before resize`).toBe(id);

      await page.setViewportSize(BELOW_MOTION_BREAKPOINT);
      await afterResize(page);
      expect(await page.evaluate(() => window.scrollY), `${id}: below breakpoint did not jump to top`).toBeGreaterThan(1_000);
      expect(await centreSection(page), `${id}: same section at 900px`).toBe(id);

      await page.setViewportSize(WIDE);
      await afterResize(page);
      expect(await page.evaluate(() => window.scrollY), `${id}: wide restore did not jump to top`).toBeGreaterThan(1_000);
      expect(await centreSection(page), `${id}: same section after round trip`).toBe(id);
    }
  });
});
