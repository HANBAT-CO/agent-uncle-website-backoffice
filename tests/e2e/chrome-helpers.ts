import { expect, type Page } from "@playwright/test";

import { fill, plate } from "../../src/content/copy";
import { BEAT_ORDER, BEATS, type BeatId, type SectionId } from "../../src/content/story";

/**
 * Shared helpers for suites that read the record chrome (WP-02): open the page
 * once the chrome has hydrated, jump to a section, wait for scroll (Lenis) to
 * come to rest, and the texts the chrome must show for a beat, computed from
 * the story table (never hard-coded).
 *
 * Chrome test hooks: [data-chrome-root][data-hydrated] (mounted),
 * [data-plate-summary] and [data-plate-clock][data-value] (read .first(): every
 * plate instance shows the same record), [data-rail-entry=<key>] (live rail
 * entries in order), [data-rail-exiting] (entries finishing their exit fade),
 * [data-record-column][data-rail-mode][data-plate-mode], [data-record-pill]
 * [data-visible], dialog[data-record-sheet], [data-rail-live].
 */

/** The chrome mounts after hydration; everything that reads the story lives under this gate. */
export async function openPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
  await page.locator("[data-rail-live]").waitFor({ state: "attached" });
  if ((page.viewportSize()?.width ?? 0) >= 1024) await page.locator("[data-record-column]").waitFor({ state: "attached" });
  else await page.locator("[data-record-pill]").waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}

/** Resolve once the page has stopped scrolling (Lenis eases for a while after wheel input). */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y = window.scrollY;
        setTimeout(() => resolve(Math.abs(window.scrollY - y) < 1), 300);
      }),
    undefined,
    { timeout: 30_000, polling: 100 },
  );
}

/**
 * Put the viewport's centre line `inset` px inside the top of a section: it
 * becomes the active section, at its start. Waits for scroll to rest unless
 * `wait` is false.
 */
export async function jumpTo(page: Page, id: SectionId, { inset = 4, wait = true }: { inset?: number; wait?: boolean } = {}): Promise<void> {
  const land = async () =>
    page.evaluate(
      ({ sectionId, px }) => {
        const section = document.querySelector<HTMLElement>(`[data-section="${sectionId}"]`);
        if (!section) throw new Error(`no section ${sectionId}`);
        const top = section.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: Math.max(0, top - window.innerHeight / 2 + px), behavior: "instant" });
      },
      { sectionId: id, px: inset },
    );
  await land();
  if (wait) {
    await settle(page);
    // Lazy pins can grow the document just after a jump. Re-land once when the
    // viewport centre is no longer in the requested section.
    const centred = await page.evaluate((sectionId) => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest("[data-section]")?.getAttribute("data-section") === sectionId, id);
    if (!centred) {
      await land();
      await settle(page);
    }
  }
}

/** Record ids the rail holds at a beat (cumulative, oldest first). */
export function entriesAt(beat: BeatId): string[] {
  const index = BEAT_ORDER.indexOf(beat);
  return BEAT_ORDER.slice(0, index + 1).flatMap((id) => BEATS[id].adds);
}

/** The plate's visually hidden summary at a beat (spec 5.3). */
export function summaryAt(beat: BeatId): string {
  const ledger = BEATS[beat].ledger;
  const shared = ledger.backorder !== null;
  return fill(plate.summary, {
    requested: ledger.requested,
    secured: ledger.secured,
    delivered: ledger.delivered,
    received: ledger.received,
    rest: shared ? plate.labels.backorder : plate.labels.unconfirmed,
    restValue: shared ? (ledger.backorder ?? 0) : (ledger.unconfirmed ?? 0),
  });
}

/** Plate summary, clock (HH:MM for 'now') and page phase match the beat. */
export async function expectBeat(page: Page, beat: BeatId): Promise<void> {
  await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt(beat));
  const clock = BEATS[beat].clock;
  const cell = page.locator("[data-plate-clock]").first();
  if (clock === "now") await expect(cell).toHaveAttribute("data-value", /^\d\d:\d\d$/);
  else await expect(cell).toHaveAttribute("data-value", clock);
  await expect(page.locator("html")).toHaveAttribute("data-phase", BEATS[beat].phase);
}

/** Live rail entry keys, in order. */
export async function liveEntries(page: Page): Promise<(string | null)[]> {
  return page.locator("[data-rail-entry]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-rail-entry")));
}

/** The rail holds exactly the beat's story entries (visitor records excluded), with no exit fade left. */
export async function expectRail(page: Page, beat: BeatId): Promise<void> {
  await expect(page.locator("[data-rail-exiting]")).toHaveCount(0);
  await expect
    .poll(async () => (await liveEntries(page)).filter((key) => key !== null && /^[rm]\d{4}[ab]?$/.test(key)))
    .toEqual(entriesAt(beat));
}
