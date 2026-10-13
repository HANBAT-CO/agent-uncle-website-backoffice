import { expect, test, type Locator, type Page } from "@playwright/test";

import { fill, plate, receipt } from "../../src/content/copy";
import { BEATS, RECORDS, type BeatId } from "../../src/content/story";

/**
 * S6 receipt (WP-15, spec S6): the 08:49 slip whose stub the shop tears to
 * confirm 2장, and the labelled what-if sample.
 *
 * The beat is read where the reader sees it: the record plate's summary and
 * clock (WP-02 chrome), the rail on desktop and the record sheet below 1024px.
 * In `next dev` the store is also on window.__auStory; there the suite counts
 * how often the section reported b0849 (exactly once per tear).
 */

const { slip, whatIf } = receipt;
const STUB_LABEL = slip.stub;
const DECREMENT = "실제 받은 수량 줄이기";
const INCREMENT = "실제 받은 수량 늘리기";

declare global {
  interface Window {
    __b0849?: number;
  }
}

/* ---------- chrome reads (WP-02 test hooks: [data-plate-summary], [data-plate-clock], rail and sheet entries) ---------- */

async function openPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
  await page.evaluate(() => document.fonts.ready);
}

/** Resolve once the page has stopped scrolling (Lenis eases for a while). */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const y = window.scrollY;
        setTimeout(() => resolve(Math.abs(window.scrollY - y) < 1), 300);
      }),
    undefined,
    { timeout: 20_000, polling: 100 },
  );
}

async function instantScrollTo(page: Page, top: number): Promise<void> {
  await page.evaluate(
    (y) =>
      new Promise<void>((resolve) => {
        const done = () => requestAnimationFrame(() => resolve());
        const hook = (window as Window & { __auScrollTo?: (top: number) => void }).__auScrollTo;
        if (typeof hook === "function") hook(y);
        else window.scrollTo({ top: y, behavior: "instant" });
        requestAnimationFrame(done);
      }),
    top,
  );
}

async function instantScrollBy(page: Page, delta: number): Promise<void> {
  const top = await page.evaluate((y) => window.scrollY + y, delta);
  await instantScrollTo(page, top);
}

/** The plate's visually hidden summary at a beat (spec 5.3), computed from the story table. */
function summaryAt(beat: BeatId): string {
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

async function expectBeat(page: Page, beat: BeatId): Promise<void> {
  await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt(beat));
  await expect(page.locator("[data-plate-clock]").first()).toHaveAttribute("data-value", BEATS[beat].clock);
  await expect(page.locator("html")).toHaveAttribute("data-phase", BEATS[beat].phase);
}

/* ---------- receipt helpers ---------- */

/** Scroll so the slip's centre sits at the viewport's centre (receipt is the active section). */
async function centreSlip(page: Page): Promise<void> {
  await page.locator("[data-receipt-anchor]").waitFor({ state: "attached" });
  const top = await page.evaluate(() => {
    const anchor = document.querySelector<HTMLElement>("[data-receipt-anchor]");
    if (!anchor) throw new Error("no receipt slip");
    const rect = anchor.getBoundingClientRect();
    return window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
  });
  await instantScrollTo(page, top);
  await settle(page);
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __auStory?: { getState: () => { active: string } } }).__auStory?.getState().active),
    )
    .toBe("receipt");
}

/** Scroll so the section's top edge sits at the viewport's top (the rest position of a slow scroll or a jump). */
async function sectionTopAtTop(page: Page): Promise<void> {
  const top = await page.evaluate(() => {
    const section = document.getElementById("receipt");
    if (!section) throw new Error("no receipt section");
    return window.scrollY + section.getBoundingClientRect().top;
  });
  await instantScrollTo(page, top);
  await settle(page);
}

/**
 * Scroll `px` past the auto-tear line (ReceiptProvider): a wide slip tears as
 * its top reaches 104px (or once scrolled through on a short viewport), a
 * phone-width slip as its bottom reaches 60% of the viewport. Negative px stops short.
 */
async function toTearLine(page: Page, px: number): Promise<void> {
  await page.locator("[data-receipt-anchor]").waitFor({ state: "attached" });
  const top = await page.evaluate((delta) => {
    const anchor = document.querySelector<HTMLElement>("[data-receipt-anchor]");
    if (!anchor) throw new Error("no receipt slip");
    const rect = anchor.getBoundingClientRect();
    const vh = window.innerHeight;
    const target =
      anchor.clientWidth >= 420 ? rect.top - Math.min(104, vh - anchor.offsetHeight - 24) : rect.bottom - vh * 0.6;
    return window.scrollY + target + delta;
  }, px);
  await instantScrollTo(page, top);
  await settle(page);
}

/** Per frame: the stub face's box, whether it shows, how far its bottom is below the slip's, and the text it covers. */
type StubFrame = { t: number; box: [number, number, number, number]; shown: boolean; fall: number; covers: string[] };

/**
 * Record the stub face's box on every frame for `ms` while `act` runs, with
 * the text it covers (the receipt h2 and body, the next section's h2 and
 * body) while it is visible. TearTicket hides the stub at the end of a tear;
 * a thrown stub also fades on the layer's children (ReceiptTear, --slip-stub-fling).
 */
async function watchStub(page: Page, ms: number, act: () => Promise<void>): Promise<StubFrame[]> {
  await page.evaluate((duration) => {
    const frames: StubFrame[] = [];
    (window as Window & { __stubFrames?: StubFrame[] }).__stubFrames = frames;
    const start = performance.now();
    const texts: [string, string][] = [
      ["receipt h2", "#receipt-title"],
      ["receipt body", "#receipt .receipt-copy p"],
      ["roles h2", "#roles h2"],
      ["roles body", "#roles .roles-copy p"],
    ];
    const tick = () => {
      const t = performance.now() - start;
      const face = document.querySelector<HTMLElement>("#receipt .slip-tear:not([data-hidden]) .slip-stub");
      const layer = face?.parentElement?.parentElement?.parentElement;
      if (face && layer) {
        const style = getComputedStyle(layer);
        const surface = layer.lastElementChild ? Number(getComputedStyle(layer.lastElementChild).opacity) : 1;
        const shown = style.visibility !== "hidden" && Number(style.opacity) * surface > 0.02;
        const box = face.getBoundingClientRect();
        const covers = shown
          ? texts
              .filter(([, selector]) => {
                const text = document.querySelector(selector)?.getBoundingClientRect();
                return text && box.right > text.left && box.left < text.right && box.bottom > text.top && box.top < text.bottom;
              })
              .map(([name]) => name)
          : [];
        const slipBottom = layer.closest(".slip-tear")?.getBoundingClientRect().bottom ?? box.bottom;
        frames.push({
          t: Math.round(t),
          box: [box.left, box.top, box.right, box.bottom].map(Math.round) as StubFrame["box"],
          shown,
          fall: Math.round(box.bottom - slipBottom),
          covers,
        });
      }
      if (t < duration) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as Window & { __stubFrames?: StubFrame[] }).__stubFrames ?? []);
}

/** A contained tear stays in the slip's column: no frame covers text, and it never swings right of the gap beside the slip. */
function expectContained(frames: StubFrame[]): void {
  expect(frames.length).toBeGreaterThan(20);
  expect(frames.filter((frame) => frame.covers.length > 0)).toEqual([]);
  const right0 = frames[0].box[2];
  for (const frame of frames) expect(frame.box[2]).toBeLessThanOrEqual(right0 + 32);
}

/** Scroll so the slip's bottom edge is `px` above the viewport's top. */
async function passSlip(page: Page, px = 80): Promise<void> {
  const top = await page.evaluate((gap) => {
    const anchor = document.querySelector<HTMLElement>("[data-receipt-anchor]");
    if (!anchor) throw new Error("no receipt slip");
    return window.scrollY + anchor.getBoundingClientRect().bottom + gap;
  }, px);
  await instantScrollTo(page, top);
  await settle(page);
}

/** Scroll so the section's top edge is `px` below the viewport's bottom. */
async function goAbove(page: Page, px = 80): Promise<void> {
  const top = await page.evaluate((gap) => {
    const section = document.getElementById("receipt");
    if (!section) throw new Error("no receipt section");
    const y = window.scrollY + section.getBoundingClientRect().top;
    return Math.max(0, y - window.innerHeight - gap);
  }, px);
  await instantScrollTo(page, top);
  await settle(page);
}

/** The TearTicket leaf has taken over from the static slip (a lazy chunk: `next dev` may compile it on first use). */
async function tearReady(page: Page): Promise<Locator> {
  const ticket = page.locator("#receipt .slip-tear:not([data-hidden])");
  await expect(ticket).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator("#receipt .slip-static")).toHaveCount(0);
  await page.locator("#receipt [data-receipt-scroll-ready]").waitFor({ state: "attached", timeout: 30_000 });
  return ticket;
}

/** Count the section's b0849 reports (dev only; resolves false in a production build). */
async function countReports(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const store = (window as Window & { __auStory?: { reportBeat: (section: string, beat: string) => void } }).__auStory;
    if (!store) return false;
    const report = store.reportBeat.bind(store);
    window.__b0849 = 0;
    store.reportBeat = (section, beat) => {
      if (section === "receipt" && beat === "b0849") window.__b0849 = (window.__b0849 ?? 0) + 1;
      report(section, beat);
    };
    return true;
  });
}

async function expectReportedOnce(page: Page, counting: boolean): Promise<void> {
  if (!counting) return;
  await expect.poll(() => page.evaluate(() => window.__b0849)).toBe(1);
}

/** The record the tear adds, wherever the chrome lists it at this width. */
async function expectReceiptRecord(page: Page, count: number): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  const entry = width >= 1280 ? page.locator('[data-rail-entry="r0849"]') : page.locator('[data-sheet-entry="r0849"]');
  await expect(entry).toHaveCount(count);
  if (count > 0 && width >= 1280) await expect(entry).toContainText(RECORDS.r0849.title);
}

async function openWhatIf(page: Page): Promise<{ issue: Locator; panel: Locator }> {
  const issue = page.getByRole("button", { name: slip.issue });
  await expect(issue).toBeVisible();
  await expect(issue).toBeEnabled();
  await issue.click();
  await expect(issue).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#receipt .whatif-sheet");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return { issue, panel };
}

async function expectTorn(page: Page): Promise<void> {
  const section = page.locator("#receipt");
  await expect(section.locator("[data-receipt-torn]")).toHaveCount(1);
  await expect(section.locator(".slip-badge[data-on]")).toBeVisible();
  await expect(section.locator(".slip-badge")).toHaveText(slip.badge);
  await expect(section.getByRole("button", { name: STUB_LABEL })).toBeHidden();
  // A delivery is confirmed once: the batch reads 수령 확인됨 and the sample can no longer open.
  await expect(section.locator(".slip-batch dd").filter({ visible: true })).toHaveText(slip.batch.quantityConfirmed, { useInnerText: true });
  await expect(section.getByRole("button", { name: slip.issue })).toHaveCount(0);
  await expect(section.getByText(slip.issueClosed).filter({ visible: true })).toBeVisible();
}

async function expectWhole(page: Page): Promise<void> {
  const section = page.locator("#receipt");
  await expect(section.locator("[data-receipt-torn]")).toHaveCount(0);
  await expect(section.locator(".slip-badge[data-on]")).toHaveCount(0);
  await expect(section.getByRole("button", { name: STUB_LABEL })).toBeVisible();
  await expect(section.locator(".slip-batch dd").filter({ visible: true })).toHaveText(slip.batch.quantity, { useInnerText: true });
}

test.describe("S6 receipt", () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page);
  });

  test("renders the slip strings verbatim with a two-column 회차 row and no dashes", async ({ page }) => {
    const section = page.locator("#receipt");
    await expect(section.getByRole("heading", { level: 2 })).toHaveText(receipt.h2.join(" "));
    await expect(section).toContainText(receipt.body);
    for (const text of [slip.title, slip.heading, slip.card[0], slip.card[1], slip.batchesLabel, slip.mint.title, slip.mint.body]) {
      await expect(section).toContainText(text);
    }
    // The slip's question is reachable by heading navigation, under the h2.
    await expect(section.getByRole("heading", { level: 3, name: slip.heading }).first()).toBeAttached();
    const batch = section.locator(".slip-batch").first();
    await expect(batch.locator("dt")).toHaveText(slip.batch.round);
    await expect(batch.locator("dd")).toHaveText(slip.batch.quantity, { useInnerText: true });
    const text = (await section.textContent()) ?? "";
    expect(text).not.toMatch(/[\u2013\u2014]/);
  });

  test("uses no red anywhere in the section", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    await page.getByRole("button", { name: slip.issue }).first().click();
    await expect(page.getByText(fill(whatIf.ghost, { actual: 1 }))).toBeVisible();
    const reds = await page.locator("#receipt").evaluate((root) => {
      const offenders: string[] = [];
      const isRed = (value: string) => {
        const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!match) return false;
        const [r, g, b] = [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255];
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (alpha === 0 || max === min) return false;
        const saturation = (max - min) / max;
        let hue = 0;
        if (max === r) hue = ((g - b) / (max - min)) * 60;
        else if (max === g) hue = ((b - r) / (max - min)) * 60 + 120;
        else hue = ((r - g) / (max - min)) * 60 + 240;
        if (hue < 0) hue += 360;
        return saturation > 0.35 && max > 0.35 && (hue < 20 || hue > 340);
      };
      for (const node of [root, ...root.querySelectorAll("*")]) {
        const style = getComputedStyle(node);
        for (const prop of ["color", "background-color", "border-top-color", "border-left-color", "fill", "stroke"] as const) {
          const value = style.getPropertyValue(prop);
          if (isRed(value)) offenders.push(`${node.tagName.toLowerCase()}.${node.getAttribute("class") ?? ""} ${prop} ${value}`);
        }
      }
      return offenders;
    });
    expect(reds).toEqual([]);
  });

  test("swaps the static slip for the tearable one without moving it", async ({ page }) => {
    const top = await page.evaluate(() => {
      const anchor = document.querySelector<HTMLElement>("[data-receipt-anchor]");
      if (!anchor) throw new Error("no receipt slip");
      const top = window.scrollY + anchor.getBoundingClientRect().top;
      return Math.max(0, top - window.innerHeight * 3);
    });
    await instantScrollTo(page, top);
    await settle(page);
    // The slip sets numbers and labels in Paperlogy 700, which loads on first use (not preloaded).
    await page.evaluate(async () => {
      await document.fonts.load('700 16px "Paperlogy"');
      await document.fonts.ready;
    });
    await expect(page.locator("#receipt .receipt-slip")).toHaveCount(1);
    // Layout heights (offsetHeight): on desktop the GSAP entrance tilts the slip, which inflates its bounding box.
    const before = await page.locator("#receipt .receipt-slip").evaluate((node) => (node as HTMLElement).offsetHeight);
    await centreSlip(page);
    await tearReady(page);
    const after = await page.locator("#receipt .receipt-slip").evaluate((node) => (node as HTMLElement).offsetHeight);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });

  test("the stub button tears it: 수령 2, clock 08:49 and the 08:49 record", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    await expectBeat(page, "b0553d");
    await expectWhole(page);
    await expectReceiptRecord(page, 0);
    const counting = await countReports(page);

    await page.getByRole("button", { name: STUB_LABEL }).click();

    await expectTorn(page);
    await expectBeat(page, "b0849");
    await expect(page.locator("[data-plate-summary]").first()).toHaveText(summaryAt("b0849"));
    await expectReceiptRecord(page, 1);
    await expectReportedOnce(page, counting);
  });

  test("Enter on the stub button tears it and moves focus to the slip", async ({ page }) => {
    // Just short of the tear line: on a phone the slip's title row is above the viewport here.
    await toTearLine(page, -40);
    await tearReady(page);
    const counting = await countReports(page);
    const button = page.getByRole("button", { name: STUB_LABEL });
    await button.focus();
    await page.keyboard.press("Enter");

    await expectTorn(page);
    const head = page.locator('#receipt .slip-tear [data-focus-key="head"]');
    await expect(head).toBeFocused();
    // The focus ring and the 수령 확인 badge land below the fixed nav (72px) and inside the viewport.
    await settle(page);
    const box = await head.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(72);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    await expectBeat(page, "b0849");
    await expectReceiptRecord(page, 1);
    await expectReportedOnce(page, counting);
  });

  test("Tab into the slip from above shows its question below the nav, then Tab and Enter tear it", async ({ page, hasTouch }) => {
    test.skip(hasTouch, "keyboard path (desktop projects)");
    // Coming from the section above: the slip starts below the viewport.
    const top = await page.evaluate(() => {
      const section = document.getElementById("receipt");
      if (!section) throw new Error("no receipt section");
      const top = window.scrollY + section.getBoundingClientRect().top;
      return Math.max(0, top - window.innerHeight * 1.1);
    });
    await instantScrollTo(page, top);
    await settle(page);
    await tearReady(page);
    // A temporary stop right before the section, so the next Tab stop is the slip's first control.
    await page.evaluate(() => {
      const stop = document.createElement("button");
      stop.type = "button";
      stop.textContent = "before receipt";
      document.getElementById("receipt")?.before(stop);
      stop.focus({ preventScroll: true });
    });
    const height = page.viewportSize()?.height ?? 0;

    await page.keyboard.press("Tab");
    const issue = page.getByRole("button", { name: slip.issue });
    await expect(issue).toBeFocused();
    await settle(page);
    // The browser shows only the focused row; the slip comes in whole, its question clear of the 72px nav.
    const question = await page.locator("#receipt .slip-tear:not([data-hidden]) .slip-heading").boundingBox();
    const row = await issue.boundingBox();
    expect(question?.y ?? -1).toBeGreaterThanOrEqual(72);
    expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual(height);
    await expectWhole(page);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: STUB_LABEL })).toBeFocused();
    await page.keyboard.press("Enter");
    await expectTorn(page);
    const head = page.locator('#receipt .slip-tear [data-focus-key="head"]');
    await expect(head).toBeFocused();
    await settle(page);
    const box = await head.boundingBox();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(72);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    await expectBeat(page, "b0849");
  });

  test("dragging (desktop) or swiping (touch) the stub tears it once", async ({ page, hasTouch }) => {
    await centreSlip(page);
    const ticket = await tearReady(page);
    const counting = await countReports(page);
    const grip = ticket.locator(".slip-grip");
    const box = await grip.boundingBox();
    if (!box) throw new Error("no grip");
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (hasTouch) {
      const stub = ticket.locator(".slip-stub");
      const init = { pointerId: 11, pointerType: "touch", isPrimary: true, button: 0, buttons: 1 };
      await stub.dispatchEvent("pointerdown", { ...init, clientX: start.x, clientY: start.y });
      for (let step = 1; step <= 12; step += 1) {
        await stub.dispatchEvent("pointermove", { ...init, clientX: start.x + step * 12, clientY: start.y + step });
        await page.waitForTimeout(24);
      }
      await stub.dispatchEvent("pointerup", { ...init, buttons: 0, clientX: start.x + 144, clientY: start.y + 12 });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 4, { steps: 6 });
      await page.mouse.move(start.x + 160, start.y + 20, { steps: 14 });
      await page.mouse.up();
    }

    await expectTorn(page);
    await expectBeat(page, "b0849");
    await expectReceiptRecord(page, 1);
    await expectReportedOnce(page, counting);
  });

  test("a pulled stub stays in hand across the copy, which steps aside until the stub is gone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wide slip beside the copy, with motion (desktop project)");
    await centreSlip(page);
    const ticket = await tearReady(page);
    const box = await ticket.locator(".slip-stub").boundingBox();
    if (!box) throw new Error("no stub");
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const read = () =>
      page.evaluate(() => {
        const layer = document.querySelector<HTMLElement>("#receipt .slip-tear div:has(> div > div > .slip-stub)");
        const face = document.querySelector<HTMLElement>("#receipt .slip-ticket .slip-stub")?.getBoundingClientRect();
        const h2 = document.getElementById("receipt-title")?.getBoundingClientRect();
        const copy = document.querySelector<HTMLElement>("#receipt .receipt-copy");
        if (!layer || !face || !h2 || !copy) throw new Error("no stub or copy");
        return {
          stub: Number(getComputedStyle(layer).opacity),
          copy: Number(getComputedStyle(copy).opacity),
          crossesH2: face.right > h2.left && face.left < h2.right && face.bottom > h2.top && face.top < h2.bottom,
        };
      });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Across the gutter (about 50px at 1440) and on through the 72px tear: the stub never fades in hand.
    for (const dx of [30, 50, 72, 100]) {
      await page.mouse.move(start.x + dx, start.y, { steps: 3 });
      await page.waitForTimeout(240);
      const frame = await read();
      expect(frame.stub).toBe(1);
      expect(frame.copy).toBeLessThanOrEqual(0.15);
      if (dx >= 72) expect(frame.crossesH2).toBe(true);
    }
    await page.mouse.up();
    await expectTorn(page);
    await expect.poll(async () => (await read()).copy).toBe(1);
  });

  test("a stub pulled toward the copy and let go goes home whole, and the copy comes back", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wide slip beside the copy, with motion (desktop project)");
    await centreSlip(page);
    const ticket = await tearReady(page);
    const box = await ticket.locator(".slip-stub").boundingBox();
    if (!box) throw new Error("no stub");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(240);
    await expect(page.locator("#receipt .receipt-copy")).toHaveCSS("opacity", "0.12");
    await page.mouse.up();
    await expect(page.locator("#receipt .receipt-copy")).toHaveCSS("opacity", "1");
    await expectWhole(page);
    expect(await ticket.locator("div:has(> div > div > .slip-stub)").evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  });

  test("a button tear drops the stub inside the slip's column, clear of the h2 and the body", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wide slip beside the copy, with motion (desktop project)");
    await centreSlip(page);
    await tearReady(page);
    const h2Before = await page.locator("#receipt-title").boundingBox();
    const frames = await watchStub(page, 1000, () => page.getByRole("button", { name: STUB_LABEL }).click());
    expectContained(frames);
    await expectTorn(page);
    // The copy glides after a reader's tear, once the stub has gone.
    await expect.poll(async () => (await page.locator("#receipt-title").boundingBox())?.x ?? 0).toBeLessThan((h2Before?.x ?? 0) - 40);
  });

  test("the auto-tear drops the stub inside the slip's column and leaves the copy where the reader is", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "wide slip beside the copy, with motion (desktop project)");
    await sectionTopAtTop(page);
    await tearReady(page);
    await toTearLine(page, -24);
    await expectWhole(page);
    const h2Before = await page.locator("#receipt-title").boundingBox();
    const frames = await watchStub(page, 1000, () => instantScrollBy(page, 48));
    expectContained(frames);
    await expect(page.locator('#receipt [data-receipt-torn="auto"]')).toHaveCount(1);
    await page.waitForTimeout(600);
    const h2After = await page.locator("#receipt-title").boundingBox();
    expect(Math.abs((h2After?.x ?? 0) - (h2Before?.x ?? 0))).toBeLessThanOrEqual(1);
  });

  test("phone: the auto-tear drops the stub straight under the slip, clear of the next section's h2 as the reader scrolls on", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width slip with motion (mobile project)");
    await sectionTopAtTop(page);
    await tearReady(page);
    await toTearLine(page, -24);
    await expectWhole(page);
    // The next section's h2 is on screen under the slip when the auto-tear fires.
    const gap = await page.evaluate(() => {
      const slipBox = document.querySelector("#receipt .slip-tear")?.getBoundingClientRect();
      const h2 = document.querySelector("#roles h2")?.getBoundingClientRect();
      return slipBox && h2 ? { below: h2.top - slipBox.bottom, onScreen: h2.top < window.innerHeight } : null;
    });
    expect(gap?.onScreen).toBe(true);
    const frames = await watchStub(page, 1200, async () => {
      // Scrolling on is how an auto-tear happens: past the line, then on through the drop.
      await instantScrollBy(page, 48);
      for (let step = 0; step < 10; step += 1) {
        await instantScrollBy(page, 24);
        await page.waitForTimeout(50);
      }
    });
    await expect(page.locator('#receipt [data-receipt-torn="auto"]')).toHaveCount(1);
    await expect(page.locator('#receipt .slip-tear[data-stub-drop="vertical"]')).toHaveCount(1);
    expectContained(frames);
    // It visibly drops (the button's short path, not TearTicket's 480px fall) and is gone well above that h2.
    const falls = frames.filter((frame) => frame.shown).map((frame) => frame.fall);
    expect(Math.max(...falls)).toBeGreaterThan(20);
    expect(Math.max(...falls)).toBeLessThan((gap?.below ?? 0) - 120);
    await expect(page.locator("#receipt .slip-tear .slip-stub")).toBeHidden();
  });

  test("a real touch swipe on the stub tears it, and the thrown stub is gone before the next section's h2 (Chromium touch input)", async ({ browser, browserName }, testInfo) => {
    // WebKit cannot send touch moves; Chromium's CDP touch input gives the stub a real implicit pointer capture.
    test.skip(browserName !== "chromium" || testInfo.project.name !== "desktop", "Chromium touch input (desktop project)");
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    try {
      const page = await context.newPage();
      await openPage(page);
      await centreSlip(page);
      const ticket = await tearReady(page);
      await toTearLine(page, -40);
      await expectWhole(page);
      const box = await ticket.locator(".slip-stub").boundingBox();
      if (!box) throw new Error("no stub");
      const cdp = await context.newCDPSession(page);
      const x = box.x + 30;
      const y = box.y + 20;
      // A swipe a little downhill, as a thumb sweeps: TearTicket throws the stub on and gravity takes it.
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      for (let step = 1; step <= 20; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + step * 10, y: y + step * 2, id: 1 }] });
        await page.waitForTimeout(16);
      }
      const frames = await watchStub(page, 1000, async () => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      });
      await expectTorn(page);
      await expect(page.locator('#receipt [data-receipt-torn="drag"]')).toHaveCount(1);
      // Let go, it fades by how far it falls (ReceiptTear): it never reaches the next section's h2 or body.
      expect(frames.length).toBeGreaterThan(20);
      expect(frames.filter((frame) => frame.covers.length > 0)).toEqual([]);
      const below = await page.evaluate(() => {
        const slipBox = document.querySelector("#receipt .slip-tear")?.getBoundingClientRect();
        const h2 = document.querySelector("#roles h2")?.getBoundingClientRect();
        return slipBox && h2 ? h2.top - slipBox.bottom : 0;
      });
      expect(Math.max(...frames.filter((frame) => frame.shown).map((frame) => frame.fall))).toBeLessThan(below - 40);
    } finally {
      await context.close();
    }
  });

  test("phone: the stub button is in clear view for a third of a viewport before the auto-tear, and 08:49 holds after it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width slip (mobile project)");
    await sectionTopAtTop(page);
    await tearReady(page);
    const read = () =>
      page.evaluate(() => {
        const button = document.querySelector("#receipt .slip-tear:not([data-hidden]) .slip-stub-button")?.getBoundingClientRect();
        const pill = document.querySelector("[data-record-pill][data-visible]")?.getBoundingClientRect();
        return {
          y: window.scrollY,
          clear: !!button && button.top >= 72 && button.bottom <= (pill ? pill.top : window.innerHeight) - 4,
          torn: document.querySelector("#receipt [data-receipt-torn]") !== null,
          clock: document.querySelector("[data-plate-clock]")?.getAttribute("data-value") ?? "",
        };
      });
    // Step down from where the slip's bottom sits at the viewport's bottom.
    const startTop = await page.evaluate(() => {
      const anchor = document.querySelector<HTMLElement>("[data-receipt-anchor]");
      if (!anchor) throw new Error("no receipt slip");
      return window.scrollY + anchor.getBoundingClientRect().bottom - window.innerHeight;
    });
    await instantScrollTo(page, startTop);
    let clearAt: number | null = null;
    let tornAt: number | null = null;
    let handedAt: number | null = null;
    for (let step = 0; step < 200 && handedAt === null; step += 1) {
      await instantScrollBy(page, 10);
      await page.waitForTimeout(40);
      const now = await read();
      if (clearAt === null && now.clear && !now.torn) clearAt = now.y;
      if (tornAt === null && now.torn) tornAt = now.y;
      if (tornAt !== null && now.clock !== BEATS.b0849.clock) handedAt = now.y;
    }
    if (clearAt === null || tornAt === null || handedAt === null) throw new Error(`no window: ${clearAt} ${tornAt} ${handedAt}`);
    const vh = page.viewportSize()?.height ?? 844;
    expect(tornAt - clearAt).toBeGreaterThanOrEqual(vh * 0.3);
    expect(handedAt - tornAt).toBeGreaterThanOrEqual(vh * 0.3);
  });

  test("a reader who stops at the slip finds it whole", async ({ page }) => {
    await sectionTopAtTop(page);
    await tearReady(page);
    await expectWhole(page);
    await toTearLine(page, -24);
    await expectWhole(page);
    await expectBeat(page, "b0553d");
  });

  test("scrolling on to the tear line tears it while the slip is still on screen", async ({ page }) => {
    await sectionTopAtTop(page);
    await tearReady(page);
    const counting = await countReports(page);
    await toTearLine(page, 12);
    await expectTorn(page);
    // Still the active section: the plate shows 08:49 next to the slip, not the next section's beat.
    await expectBeat(page, "b0849");
    await expectReceiptRecord(page, 1);
    await expectReportedOnce(page, counting);
    const slipBox = await page.locator("[data-receipt-anchor]").boundingBox();
    expect(slipBox?.y ?? 0).toBeGreaterThan(-(slipBox?.height ?? 0) / 2);
  });

  test("scrolling past the slip without tearing it tears it", async ({ page }) => {
    await centreSlip(page);
    await expectWhole(page);
    await passSlip(page);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(1);
    await centreSlip(page);
    await expectTorn(page);
    await expectBeat(page, "b0849");
  });

  test("a jump from the top to the end of the page still tears it", async ({ page }) => {
    await instantScrollTo(page, await page.evaluate(() => document.documentElement.scrollHeight));
    await settle(page);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(1);
    await centreSlip(page);
    await expectTorn(page);
    await expectBeat(page, "b0849");
  });

  test("scrolling back above the section makes the slip whole again", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    await page.getByRole("button", { name: STUB_LABEL }).click();
    await expectTorn(page);

    await goAbove(page);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(0);
    await expect(page.locator("[data-plate-summary]").first()).toContainText("수령 0장");

    await centreSlip(page);
    await expectWhole(page);
    await expectBeat(page, "b0553d");
    await expectReceiptRecord(page, 0);
  });

  test("the what-if sample is labelled and never changes the record", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    await expectReceiptRecord(page, 0);
    await expect.poll(() => page.locator("[data-rail-entry], [data-sheet-entry]").count()).toBeGreaterThan(0);
    const railBefore = await page.locator("[data-rail-entry], [data-sheet-entry]").count();
    const beatsBefore = await page.evaluate(() => (window as Window & { __auStory?: { getState(): unknown } }).__auStory?.getState() ?? null);

    const { issue, panel } = await openWhatIf(page);
    await expect(panel).toContainText(whatIf.label);
    await expect(panel).toContainText(whatIf.field);
    await expect(panel).toContainText(whatIf.helper);

    // It opens one short, so the consequence is there at once: 실제 1개 · 기록 2개.
    await expect(panel).toContainText(fill(whatIf.ghost, { actual: 1 }));
    for (const text of [whatIf.reasonRequired, ...whatIf.steps, whatIf.resolver, whatIf.note]) await expect(panel).toContainText(text);
    await expect(panel.locator(".whatif-ghost-title")).toBeInViewport();

    await page.getByRole("button", { name: DECREMENT }).click();
    await expect(panel).toContainText(fill(whatIf.ghost, { actual: 0 }));

    // At the delivered quantity there is no difference: the optional field stays, the problem goes.
    await page.getByRole("button", { name: INCREMENT }).click();
    await page.getByRole("button", { name: INCREMENT }).click();
    await expect(panel.locator(".whatif-ghost")).toHaveCount(0);
    await expect(panel).not.toContainText(whatIf.reasonRequired);
    await expect(panel).toContainText(whatIf.helper);

    await expectBeat(page, "b0553d");
    await expect(page.locator("[data-rail-entry], [data-sheet-entry]")).toHaveCount(railBefore);
    if (beatsBefore) {
      const beatsAfter = await page.evaluate(() => (window as Window & { __auStory?: { getState(): unknown } }).__auStory?.getState() ?? null);
      expect(beatsAfter).toEqual(beatsBefore);
    }
    await expectWhole(page);

    await page.getByRole("button", { name: whatIf.back }).click();
    await expect(panel).toHaveCount(0);
    await expect(issue).toBeFocused();
    await expect(issue).toHaveAttribute("aria-expanded", "false");
  });

  test("a closing sample leaves the tab order at once", async ({ page, hasTouch }, testInfo) => {
    test.skip(hasTouch || testInfo.project.name === "reduced-motion", "keyboard path with a 700ms exit (desktop project)");
    await centreSlip(page);
    await tearReady(page);
    const { issue, panel: sheet } = await openWhatIf(page);
    await expect(sheet).not.toHaveAttribute("inert");
    await page.getByRole("button", { name: whatIf.back }).click();
    // Mid-exit (700ms): still in the DOM, collapsing, and inert.
    await expect(sheet).toHaveAttribute("inert", "");
    await expect(issue).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: STUB_LABEL })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest(".whatif-sheet") === null)).toBe(true);
    await expect(sheet).toHaveCount(0);
  });

  test("the stepper holds still while the difference block opens and closes", async ({ page }) => {
    await sectionTopAtTop(page);
    await tearReady(page);
    const { panel } = await openWhatIf(page);
    await expect(panel.locator(".whatif-ghost")).toBeVisible();
    await page.waitForTimeout(1600); // past the 700ms opening and its safe refresh
    await settle(page);

    const increment = page.getByRole("button", { name: INCREMENT });
    const decrement = page.getByRole("button", { name: DECREMENT });
    const top = async (button: Locator) => Math.round((await button.boundingBox())?.y ?? Number.NaN);
    const at1 = await top(increment);

    // 1 to 2: the difference block collapses under the stepper, which stays under the pointer.
    await increment.click();
    await expect(panel.locator(".whatif-gap")).toHaveCount(0);
    await settle(page);
    expect(Math.abs((await top(increment)) - at1)).toBeLessThanOrEqual(1);

    // 2 to 1: it opens again below, and the minus button is where it was.
    await decrement.click();
    await expect(panel.locator(".whatif-ghost")).toBeVisible();
    await page.waitForTimeout(900);
    await settle(page);
    expect(Math.abs((await top(decrement)) - at1)).toBeLessThanOrEqual(1);
  });

  test("the open sample holds the auto-tear; closing it there waits for the next scroll", async ({ page }) => {
    await sectionTopAtTop(page);
    await tearReady(page);
    const { panel } = await openWhatIf(page);
    await settle(page);

    // The sample says the quantity differs, so scrolling on past the line does not confirm 2장.
    await toTearLine(page, 120);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(0);
    await expect(panel).toContainText(fill(whatIf.ghost, { actual: 1 }));
    await expectBeat(page, "b0553d");

    // Going back does not tear by itself...
    await page.getByRole("button", { name: whatIf.back }).click();
    await expect(panel).toHaveCount(0);
    await settle(page);
    await page.waitForTimeout(400); // past the debounced ScrollTrigger refresh
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(0);

    // ...the reader's next forward scroll does (past ReceiptProvider's 48px slack, short of the roles handoff).
    await instantScrollBy(page, 80);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(1);
    await expectBeat(page, "b0849");
  });

  test("tearing with the sample open closes it, and a torn slip cannot reopen it", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    const { panel } = await openWhatIf(page);

    await page.getByRole("button", { name: STUB_LABEL }).click();
    await expectTorn(page);
    await expect(panel).toHaveCount(0);
    await expectBeat(page, "b0849");
    await expectReceiptRecord(page, 1);
  });

  test("opening the sample keeps the 05:53 plate while the page reveals it, and 돌아가기 rests clear of the record pill", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    await expectBeat(page, "b0553d");
    const { panel: sheet } = await openWhatIf(page);
    // The sheet opens (700ms), then the page scrolls it into view: the plate never leaves the morning.
    const clocks = new Set<string>();
    for (let poll = 0; poll < 30; poll += 1) {
      clocks.add((await page.locator("[data-plate-clock]").first().getAttribute("data-value")) ?? "");
      await page.waitForTimeout(100);
    }
    expect([...clocks]).toEqual([BEATS.b0553d.clock]);
    await settle(page);
    await expectBeat(page, "b0553d");
    await expectReceiptRecord(page, 0);

    // The sheet's 예시 label is below the nav and its 돌아가기 is the element at its own centre (no pill over it).
    expect((await sheet.locator(".whatif-label").boundingBox())?.y ?? 0).toBeGreaterThanOrEqual(72);
    const back = page.getByRole("button", { name: whatIf.back });
    await expect(back).toBeInViewport();
    const hit = await back.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    });
    expect(hit).toBe(true);
  });

  test("the status chain reads as one line: no arrow starts a line", async ({ page }) => {
    await centreSlip(page);
    await tearReady(page);
    const { panel } = await openWhatIf(page);
    const steps = panel.locator(".whatif-steps");
    await expect(steps).toBeVisible();
    const layout = await steps.evaluate((list) => {
      const left = list.getBoundingClientRect().left;
      return [...list.querySelectorAll(".whatif-arrow")].map((arrow) => {
        const pill = arrow.previousElementSibling?.getBoundingClientRect();
        const box = arrow.getBoundingClientRect();
        return { afterPill: !!pill && box.left > pill.right && Math.abs(box.top + box.height / 2 - (pill.top + pill.height / 2)) < 4, atLineStart: box.left - left < 4 };
      });
    });
    expect(layout).toHaveLength(whatIf.steps.length - 1);
    for (const arrow of layout) expect(arrow).toEqual({ afterPill: true, atLineStart: false });
  });

  test("moving on with the sample open beside the slip tears it as roles takes the beat", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "the sample sits beside the slip from 1024px");
    await centreSlip(page);
    await tearReady(page);
    await openWhatIf(page);
    await page.waitForTimeout(1600); // past the 700ms opening and its refresh
    await settle(page);
    await expectWhole(page);

    // Still the active section (its bottom below the centre line): held.
    const nearHandoff = await page.evaluate(() => {
      const section = document.getElementById("receipt");
      if (!section) throw new Error("no receipt section");
      return window.scrollY + section.getBoundingClientRect().bottom - window.innerHeight / 2 - 40;
    });
    await instantScrollTo(page, nearHandoff);
    await settle(page);
    await expect(page.locator("#receipt [data-receipt-torn]")).toHaveCount(0);

    // Past it: the ledger says 수령 2, so the slip on screen says so too.
    await instantScrollBy(page, 80);
    await expect(page.locator('#receipt [data-receipt-torn="auto"]')).toHaveCount(1);
    await expect(page.locator("#receipt .whatif-sheet")).toHaveCount(0);
    await expect(page.locator("#receipt .slip-badge[data-on]")).toBeVisible();
    await expectReceiptRecord(page, 1);
  });

  test("reduced motion: no tilt, and the tear is instant", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    await centreSlip(page);
    await tearReady(page);
    expect(await page.locator("#receipt .receipt-tilt").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
    await page.getByRole("button", { name: STUB_LABEL }).click();
    await expect(page.locator("#receipt .slip-tear .slip-stub")).toBeHidden({ timeout: 150 });
    await expectTorn(page);
    await expectBeat(page, "b0849");
  });
});
