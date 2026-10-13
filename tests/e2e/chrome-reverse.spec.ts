import { expect, test, type Page } from "@playwright/test";

import { BEATS, SECTION_DEFAULT_BEAT, type SectionId } from "../../src/content/story";

import { entriesAt, jumpTo, liveEntries, openPage, settle, summaryAt } from "./chrome-helpers";

/**
 * Reverse and fast scrolling (plan review focus 1, spec 15): beats, the plate,
 * the rail and the phase are pure functions of scroll position, so after any
 * scroll pattern the chrome must match the section at the viewport centre,
 * with no orphaned or duplicate rail entries.
 *
 * End then Home, then a wheel fling down and back up (desktop projects), then
 * a storm of jumps. Mobile WebKit has no wheel: the fling is a run of
 * programmatic scroll jumps there.
 */

/* ---------- helpers ---------- */

/** The 22:00 state: plate 22:00, two rail entries (r2005, r2031), night, nothing left fading. */
async function expectTwentyTwo(page: Page): Promise<void> {
  await expect(page.locator("[data-plate-clock]").first()).toHaveAttribute("data-value", BEATS.b2200.clock);
  await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt("b2200"));
  await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
  await expect(page.locator("[data-rail-exiting]")).toHaveCount(0);
  await expect.poll(() => liveEntries(page)).toEqual(entriesAt("b2200"));
  // The flaps settle on the target: no tile left mid-flip.
  await expect(page.locator(".au-flap__flap")).toHaveCount(0);
}

async function toBottom(page: Page): Promise<void> {
  const column = page.locator("[data-record-column]");
  // Lazy sections near the bottom can mount and re-measure pins mid-jump; press End again like a reader would.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    // Mobile WebKit ignores End without a hardware keyboard: jump the way a fling would end.
    if (await page.evaluate(() => window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 2)) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    }
    await settle(page);
    if ((await column.getAttribute("data-rail-mode")) === "pill") return;
  }
}

async function toTop(page: Page): Promise<void> {
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => window.scrollY === 0);
  if (!moved) await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await settle(page);
}

const hasWheel = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/* ---------- suites ---------- */

test.describe("reverse and fast scroll", () => {
  test("End then Home restores 22:00, two rail entries and the night", async ({ page }) => {
    await openPage(page);
    await toBottom(page);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "day");
    await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt(SECTION_DEFAULT_BEAT.footer));
    await toTop(page);
    await expectTwentyTwo(page);
  });

  test("a wheel fling to the bottom and back up restores 22:00", async ({ page }) => {
    await openPage(page);
    if (hasWheel(page)) {
      await page.mouse.move(600, 450);
      for (let i = 0; i < 40; i += 1) {
        await page.mouse.wheel(0, 2_400);
        await page.waitForTimeout(16);
      }
      await settle(page);
      for (let i = 0; i < 50; i += 1) {
        await page.mouse.wheel(0, -2_400);
        await page.waitForTimeout(16);
      }
      await settle(page);
      // A fling can stop short of 0 on a long page: finish with Home like a reader would.
      if (await page.evaluate(() => window.scrollY > 0)) await toTop(page);
    } else {
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += 900) await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      for (let y = height; y >= 0; y -= 1_100) await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await settle(page);
    }
    await expectTwentyTwo(page);
  });

  test("Home, End and PageDown move the page right after a wheel scroll", async ({ page }) => {
    test.skip(!hasWheel(page), "wheel input from 1024px");
    await openPage(page);
    await page.mouse.move(600, 450);
    for (const key of ["End", "Home", "PageDown"] as const) {
      await jumpTo(page, "trust", { inset: 200 });
      // A short wheel run: the page looks still within a few hundred ms while the smooth tail still runs.
      for (let i = 0; i < 4; i += 1) {
        await page.mouse.wheel(0, -220);
        await page.waitForTimeout(160);
      }
      await settle(page);
      const before = await page.evaluate(() => window.scrollY);
      await page.keyboard.press(key);
      await page.waitForTimeout(1_200);
      const after = await page.evaluate(() => ({ y: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }));
      if (key === "End") expect(after.y, key).toBeGreaterThanOrEqual(after.max - 2);
      else if (key === "Home") expect(after.y, key).toBe(0);
      else expect(after.y - before, key).toBeGreaterThan(200);
    }
  });

  test("a storm of jumps leaves no duplicate or orphaned entries", async ({ page }) => {
    await openPage(page);
    const storm: SectionId[] = ["footer", "words", "receipt", "hero", "signup", "cart", "film", "route", "dawn", "words", "trust", "cart"];
    for (const id of storm) {
      await jumpTo(page, id, { wait: false });
      await page.waitForTimeout(90);
    }
    await settle(page);
    // The cart reports nothing of its own (spec S4): its default beat is the truth to land on.
    const beat = SECTION_DEFAULT_BEAT.cart;
    await expect(page.locator("[data-rail-exiting]")).toHaveCount(0);
    await expect.poll(() => liveEntries(page)).toEqual(entriesAt(beat));
    const keys = await page.locator("[data-rail-entry], [data-rail-exiting]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-key")));
    expect(new Set(keys).size).toBe(keys.length);
    await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt(beat));
    await expect(page.locator("html")).toHaveAttribute("data-phase", BEATS[beat].phase);
  });
});
