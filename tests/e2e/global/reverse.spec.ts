import { expect, test, type Page } from "@playwright/test";

import { fill, plate } from "../../../src/content/copy";
import { BEATS, type BeatId, type SectionId } from "../../../src/content/story";
import { entriesAt, liveEntries, openPage, settle, summaryAt } from "../chrome-helpers";

/**
 * Reverse scroll through every pin (plan review focus 1, spec 15).
 *
 * Page Down from the top to the footer, then Page Up back to the top. At every
 * stop the record chrome must tell one consistent story, and that story must
 * belong to the section at the viewport centre:
 * - the plate summary, the plate clock, html[data-phase] and the rail (or the
 *   mobile pill's count) all match one beat B, with no orphaned entries and
 *   nothing left fading;
 * - B is a beat the centre section can report there. Pinned sections on
 *   desktop motion report from their own pin progress (spec 3.3), so for the
 *   route and dawn pins B must match the marker table at that progress, with
 *   a small tolerance at each threshold; elsewhere B must be one of the
 *   section's beats.
 * End then Home and wheel flings are covered by tests/e2e/chrome-reverse.spec.ts
 * (WP-02); this suite adds the stop-by-stop check in both directions.
 * Mobile WebKit has no Page Down without a hardware keyboard: the stops there
 * are programmatic jumps of the same size.
 */

const SECTION_BEATS: Record<SectionId, readonly BeatId[]> = {
  hero: ["b2200"],
  words: ["b2330"],
  route: ["b2330", "b0216", "b0306", "b0307"],
  cart: ["b0307"],
  dawn: ["b0307", "b0553", "b0553d"],
  receipt: ["b0553d", "b0849"],
  roles: ["b0941"],
  trust: ["b0941"],
  film: ["b0941"],
  signup: ["bnow"],
  footer: ["bnow"],
};

/** Desktop pin markers (spec S3, S5): [progress, beat], plus the pin length in viewport heights. */
const PIN_MARKERS: Partial<Record<SectionId, { length: number; markers: ReadonlyArray<readonly [number, BeatId]> }>> = {
  route: { length: 1.8, markers: [[0, "b2330"], [0.32, "b0216"], [0.66, "b0306"], [0.9, "b0307"]] },
  dawn: { length: 1.2, markers: [[0, "b0307"], [0.3, "b0553"], [0.62, "b0553d"]] },
};
const THRESHOLD_TOLERANCE = 0.04;

type Stop = { y: number; section: SectionId | null; progress: number | null; pinned: boolean };

async function centre(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const line = window.innerHeight / 2;
    let found: { id: string; top: number } | null = null;
    for (const section of document.querySelectorAll<HTMLElement>("[data-section]")) {
      const box = section.getBoundingClientRect();
      if (box.top <= line && box.bottom > line) found = { id: section.dataset.section ?? "", top: box.top };
    }
    const desktopMotion = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches;
    return {
      y: Math.round(window.scrollY),
      section: (found?.id ?? null) as SectionId | null,
      // Pins start at 'top top': progress is how far the section top has scrolled past the viewport top.
      progress: found ? -found.top / window.innerHeight : null,
      pinned: desktopMotion,
    };
  });
}

/** Beats the centre section may show at this stop. */
function allowedBeats(stop: Stop): readonly BeatId[] {
  if (!stop.section) return [];
  const pin = PIN_MARKERS[stop.section];
  if (!pin || !stop.pinned || stop.progress === null) return SECTION_BEATS[stop.section];
  const p = stop.progress / pin.length;
  const beatAt = (value: number) => {
    let beat = pin.markers[0][1];
    for (const [at, id] of pin.markers) if (value >= at) beat = id;
    return beat;
  };
  return [...new Set([beatAt(p - THRESHOLD_TOLERANCE), beatAt(p), beatAt(p + THRESHOLD_TOLERANCE)])];
}

/** The beat the chrome shows, if its plate, clock, phase and rail all agree on one. */
async function shownBeat(page: Page): Promise<{ beat: BeatId | null; detail: string }> {
  const exiting = await page.locator("[data-rail-exiting]").count();
  const summary = (await page.locator("[data-plate-summary]").first().textContent())?.trim() ?? "";
  const clock = (await page.locator("[data-plate-clock]").first().getAttribute("data-value")) ?? "";
  const phase = (await page.locator("html").getAttribute("data-phase")) ?? "";
  const entries = (await liveEntries(page)).filter((key) => key !== null && /^[rm]\d{4}[ab]?$/.test(key));
  const pillText = (await page.locator("[data-record-pill]").first().textContent().catch(() => null)) ?? "";
  const detail = JSON.stringify({ summary, clock, phase, entries, pillText, exiting });
  if (exiting > 0) return { beat: null, detail };
  for (const id of Object.keys(BEATS) as BeatId[]) {
    const beat = BEATS[id];
    const clockOk = beat.clock === "now" ? /^\d\d:\d\d$/.test(clock) : clock === beat.clock;
    const railOk = JSON.stringify(entries) === JSON.stringify(entriesAt(id));
    const pillOk = pillText === "" || pillText.includes(fill(plate.pill.count, { count: entriesAt(id).filter((entry) => !entry.startsWith("m")).length }));
    if (summary === summaryAt(id) && clockOk && phase === beat.phase && railOk && pillOk) {
      // b0553d and b0849 differ in the ledger; b0941 and bnow differ in the clock; b2330 and b0216 share the
      // ledger but not the rail. A match is unambiguous because the rail and the clock are part of it.
      return { beat: id, detail };
    }
  }
  return { beat: null, detail };
}

async function expectConsistent(page: Page, label: string): Promise<void> {
  await settle(page);
  // The chrome may need a frame or two after the scroll settles (debounced live region, flaps).
  await expect
    .poll(
      async () => {
        const stop = await centre(page);
        const { beat, detail } = await shownBeat(page);
        const allowed = allowedBeats(stop);
        return beat !== null && allowed.includes(beat) ? "ok" : `${label} y=${stop.y} ${stop.section} p=${stop.progress?.toFixed(3)} allowed=${allowed.join("|")} shown=${beat} ${detail}`;
      },
      { timeout: 8_000, intervals: [150, 250, 400, 600] },
    )
    .toBe("ok");
}

const usesKeyboard = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function step(page: Page, direction: 1 | -1): Promise<void> {
  if (usesKeyboard(page)) {
    await page.keyboard.press(direction === 1 ? "PageDown" : "PageUp");
    await page.waitForTimeout(250);
  } else {
    await page.evaluate((sign) => window.scrollBy({ top: sign * Math.round(window.innerHeight * 0.85), behavior: "instant" }), direction);
  }
}

const atBottom = (page: Page) =>
  page.evaluate(() => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2);

test.describe("global: reverse scroll through every pin", () => {
  test.setTimeout(300_000);

  test("Page Down to the footer and Page Up back: the chrome matches the centre section at every stop", async ({ page }) => {
    await openPage(page);
    // Keyboard scrolling acts on the focused document: start from the body, not an input.
    await page.locator("body").click({ position: { x: 4, y: 4 }, force: true }).catch(() => undefined);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    let previous = -1;
    for (let i = 0; i < 80 && !(await atBottom(page)); i += 1) {
      await step(page, 1);
      await expectConsistent(page, `down ${i}`);
      const y = await page.evaluate(() => Math.round(window.scrollY));
      if (y === previous) {
        // Lazy islands near the bottom can re-measure the page mid-step; finish the way a reader would.
        await page.evaluate(() => window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: "instant" }));
      }
      previous = y;
    }
    await expect(page.locator("html")).toHaveAttribute("data-phase", "day");

    for (let i = 0; i < 80 && (await page.evaluate(() => window.scrollY > 0)); i += 1) {
      await step(page, -1);
      await expectConsistent(page, `up ${i}`);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await settle(page);
    await expect(page.locator("[data-plate-clock]").first()).toHaveAttribute("data-value", BEATS.b2200.clock);
    await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt("b2200"));
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    await expect.poll(() => liveEntries(page)).toEqual(entriesAt("b2200"));
  });
});
