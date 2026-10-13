import { expect, test, type Page } from "@playwright/test";

import type { SectionId } from "../../../src/content/story";
import { openPage, settle } from "../chrome-helpers";

/**
 * Resize during a pin (plan review focus 2): from 1440 to 1024 and back to
 * 1440 while parked at 50% of each pin. After ScrollTrigger refreshes, the
 * section heading sits where it sat before (within 4px), the page is as tall
 * as before, and every pinned element still has exactly one spacer (no
 * duplicates from re-pinning).
 *
 * Desktop motion only: pins exist from 1024px with motion allowed (spec 3.2),
 * so the mobile and reduced-motion projects only check that no pin exists.
 */

const PINS: ReadonlyArray<{ id: SectionId; length: number }> = [
  { id: "hero", length: 1.0 },
  { id: "words", length: 1.2 },
  { id: "route", length: 1.8 },
  { id: "dawn", length: 1.2 },
  { id: "film", length: 0.8 },
];

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 1024, height: 900 };

/** Wait until ScrollTrigger has refreshed for the current size and scrolling has stopped. */
async function afterResize(page: Page): Promise<void> {
  // ScrollTrigger debounces resize refreshes (about 200ms); lazy islands may add one more.
  await page.waitForTimeout(900);
  await settle(page);
  await page.waitForTimeout(300);
}

async function parkAtHalf(page: Page, id: SectionId, length: number): Promise<void> {
  await page.evaluate(
    ({ sectionId, share }) => {
      const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
      if (!section) throw new Error(`no section ${sectionId}`);
      const top = section.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.round(top + share * window.innerHeight), behavior: "instant" });
    },
    { sectionId: id, share: length * 0.5 },
  );
  await settle(page);
  await page.waitForTimeout(700);
}

/** Mount every lazy island first (they mount within a viewport and can change heights by a few px). */
async function primeLazyIslands(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await afterResize(page);
}

async function headingTop(page: Page, id: SectionId): Promise<number> {
  return page.locator(`#${id}-title`).evaluate((node) => node.getBoundingClientRect().top);
}

async function spacerReport(page: Page) {
  return page.evaluate(() => {
    const spacers = [...document.querySelectorAll(".pin-spacer")];
    const nested = spacers.filter((spacer) => spacer.parentElement?.closest(".pin-spacer")).length;
    const childless = spacers.filter((spacer) => spacer.children.length !== 1).length;
    return { count: spacers.length, nested, childless };
  });
}

test.describe("global: resize during pins", () => {
  test.setTimeout(240_000);

  test("1440 to 1024 to 1440 at 50% of each pin keeps the heading in place and one spacer per pin", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "pins exist only on desktop motion");
    await page.setViewportSize(WIDE);
    await openPage(page);
    await afterResize(page);
    await primeLazyIslands(page);

    const startHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(await spacerReport(page)).toEqual({ count: PINS.length, nested: 0, childless: 0 });

    for (const pin of PINS) {
      await parkAtHalf(page, pin.id, pin.length);
      const before = await headingTop(page, pin.id);
      const scrollBefore = await page.evaluate(() => window.scrollY);

      await page.setViewportSize(NARROW);
      await afterResize(page);
      await page.setViewportSize(WIDE);
      await afterResize(page);

      // A refresh may nudge native scroll; the reader's place in the pin is what must hold.
      const scrollAfter = await page.evaluate(() => window.scrollY);
      expect(Math.abs(scrollAfter - scrollBefore), `${pin.id}: scroll position after the round trip`).toBeLessThanOrEqual(4);
      await expect
        .poll(async () => Math.abs((await headingTop(page, pin.id)) - before), {
          message: `${pin.id}: heading position after 1440 > 1024 > 1440`,
          timeout: 6_000,
        })
        .toBeLessThanOrEqual(4);
      expect(await spacerReport(page), `${pin.id}: pin spacers`).toEqual({ count: PINS.length, nested: 0, childless: 0 });
    }

    expect(Math.abs((await page.evaluate(() => document.documentElement.scrollHeight)) - startHeight)).toBeLessThanOrEqual(4);
  });

  test("crossing the 1024px motion breakpoint, or a shorter window, keeps the reader in the same section", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the branch flip needs desktop motion on one side");
    await page.setViewportSize(WIDE);
    await openPage(page);
    await afterResize(page);
    await primeLazyIslands(page);

    /** The section under the viewport's centre line. */
    const centreSection = () =>
      page.evaluate(() => {
        const centre = window.innerHeight / 2;
        for (const section of document.querySelectorAll<HTMLElement>("[data-section]")) {
          const box = section.getBoundingClientRect();
          if (box.top <= centre && box.bottom > centre) return section.dataset.section ?? null;
        }
        return null;
      });

    for (const id of ["trust", "signup"] as const) {
      await page.evaluate((sectionId) => {
        const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
        if (!section) throw new Error(`no section ${sectionId}`);
        window.scrollTo({ top: Math.round(section.getBoundingClientRect().top + window.scrollY + 300), behavior: "instant" });
      }, id);
      await settle(page);
      await page.waitForTimeout(700);
      const before = await headingTop(page, id);
      expect(await centreSection(), `${id}: parked`).toBe(id);

      for (const size of [{ width: 1000, height: 900 }, WIDE, { width: 1440, height: 700 }, WIDE]) {
        await page.setViewportSize(size);
        await afterResize(page);
        const label = `${id} at ${size.width}x${size.height}`;
        expect(await page.evaluate(() => window.scrollY), `${label}: not thrown to the top`).toBeGreaterThan(2000);
        expect(await centreSection(), `${label}: same section under the centre line`).toBe(id);
      }
      // Back at the starting size, the heading is where it was.
      expect(Math.abs((await headingTop(page, id)) - before), `${id}: heading after the round trip`).toBeLessThanOrEqual(8);
    }
  });

  test("no pins without desktop motion", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "desktop", "the desktop project pins by design");
    await openPage(page);
    await afterResize(page);
    expect((await spacerReport(page)).count).toBe(0);
  });
});
