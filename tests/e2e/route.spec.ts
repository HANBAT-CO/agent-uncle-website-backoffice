import { expect, test, type Locator, type Page } from "@playwright/test";

import { CAMERA_END, captionIndex } from "../../src/components/sections/route/route-script";
import { route } from "../../src/content/copy";
import { RECORDS, type BeatId } from "../../src/content/story";
import { expectBeat, expectRail, openPage, settle, summaryAt } from "./chrome-helpers";

/**
 * S3 route (WP-12): the round 02:16 APM, 03:06 청평화, 03:07 message.
 *
 * desktop: the pin's beats move the ledger only at 03:06 (the 02:16 cardigan
 *   card and the 03:07 bubble never change the plate); scrubbing back restores
 *   every beat; the lamp stays on the dashed route at every progress and after
 *   a resize; captions, tags and floor ticks follow the lamp both ways, and a
 *   caption's clock never runs ahead of the plate's; leaving the film mid-way
 *   (a resize below 1024px, reduced motion switched on) keeps every caption;
 *   #route lands on the settled round framing; keyboard pages rest on every
 *   stop, both ways; the pin turns on and off without a layout shift and
 *   opens on a lit map.
 * mobile: no pin; each stop block reports its beat as its centre crosses the
 *   viewport centre, in order and back; the 03:07 block has no map crop.
 * reduced-motion: no pin; the end state (route drawn, both tags, both ticks);
 *   beats per caption.
 *
 * Route hooks: [data-route-scene] (pinned on desktop), [data-route-camera],
 * [data-route-dot], [data-route-tag], [data-route-stop=A|B|C|D][data-current],
 * [data-stop-beat] (the beat a stop block reports).
 */

function onlyIn(project: string) {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== project, `${project} project only`);
  });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** The scroll position of a desktop route pin progress (0..1). */
async function ensureRoutePin(page: Page): Promise<void> {
  const pinned = await page.evaluate(() => document.querySelector<HTMLElement>("[data-route-scene]")?.parentElement?.classList.contains("pin-spacer") ?? false);
  if (pinned) return;
  await page.evaluate(() => {
    const section = document.getElementById("route");
    if (!section) throw new Error("missing route");
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 8), behavior: "instant" });
  });
  await page.locator('.route-root[data-route-mode="pinned"]').waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-route-scene]")?.parentElement?.classList.contains("pin-spacer") === true);
  await settle(page);
}

async function pinScroll(page: Page, progress: number): Promise<number> {
  await ensureRoutePin(page);
  return page.evaluate((p) => {
    const spacer = document.querySelector<HTMLElement>("[data-route-scene]")?.parentElement;
    if (!spacer?.classList.contains("pin-spacer")) throw new Error("the route scene is not pinned");
    const start = spacer.getBoundingClientRect().top + window.scrollY;
    return Math.round(start + p * (spacer.offsetHeight - window.innerHeight));
  }, progress);
}

/** Scroll the desktop route pin to `progress` (0..1) and wait for scroll to rest. */
async function toPin(page: Page, progress: number): Promise<void> {
  const top = await pinScroll(page, progress);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await settle(page);
}

/** The desktop route pin's current progress (0..1) from the scroll position. */
async function pinProgress(page: Page): Promise<number> {
  return page.evaluate(() => {
    const spacer = document.querySelector<HTMLElement>("[data-route-scene]")?.parentElement;
    if (!spacer?.classList.contains("pin-spacer")) throw new Error("the route scene is not pinned");
    const start = spacer.getBoundingClientRect().top + window.scrollY;
    return (window.scrollY - start) / (spacer.offsetHeight - window.innerHeight);
  });
}

/** Opacity and inline style of every caption block, as "A:1" strings. */
async function stopStates(page: Page): Promise<string[]> {
  return page
    .locator("[data-route-stop]")
    .evaluateAll((items) =>
      items.map((item) => `${item.getAttribute("data-route-stop")}:${getComputedStyle(item).opacity}:${item.getAttribute("style") ?? ""}`),
    );
}

/** Put the viewport's centre line `offset` px below the centre of `target`. */
async function centreOn(page: Page, target: Locator, offset: number): Promise<void> {
  const top = await target.evaluate((element, px) => {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.top + window.scrollY + rect.height / 2 + px - window.innerHeight / 2);
  }, offset);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await settle(page);
}

/** Screen distance (px) from the lamp's centre to the nearest point of the dashed route. */
async function lampDistance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const camera = document.querySelector<HTMLElement>("[data-route-camera]");
    const dot = camera?.querySelector<HTMLElement>("[data-route-dot]");
    const path = camera?.querySelector<SVGPathElement>(".map-route");
    const matrix = path?.getScreenCTM();
    if (!dot || !path || !matrix) throw new Error("no lamp or route");
    const rect = dot.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const length = path.getTotalLength();
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 2000; i += 1) {
      const point = path.getPointAtLength((length * i) / 2000);
      const x = matrix.a * point.x + matrix.c * point.y + matrix.e;
      const y = matrix.b * point.x + matrix.d * point.y + matrix.f;
      best = Math.min(best, Math.hypot(x - cx, y - cy));
    }
    return best;
  });
}

/**
 * Scroll to `y`, then for `ms` check every animation frame (the scrub eases the film through
 * every camera pose in between) that no map label the eye can see sits on the heading.
 * Returns the frames that broke it, as "apm@0.61 (40x12px)" (seen opacity, overlap); throws
 * if the scene was never pinned on screen, so a moved page cannot pass for a clean one.
 */
async function labelsOverHeading(page: Page, y: number, ms: number): Promise<string[]> {
  return page.evaluate(
    async ({ top, duration }) => {
      const heading = document.querySelector<HTMLElement>("[data-route-head] h2");
      const scene = document.querySelector<HTMLElement>("[data-route-scene]");
      const labels = [...document.querySelectorAll<HTMLElement>("[data-route-camera] .route-labels [data-building] > *")];
      if (!heading || !scene || labels.length === 0) throw new Error("no heading, scene or map labels");
      const seen = (element: Element) => {
        let opacity = 1;
        for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      };
      const hits: string[] = [];
      window.scrollTo({ top, behavior: "instant" });
      const end = performance.now() + duration;
      while (performance.now() < end) {
        await new Promise(requestAnimationFrame);
        const h = heading.getBoundingClientRect();
        for (const label of labels) {
          const opacity = seen(label);
          if (opacity < 0.02) continue;
          const r = label.getBoundingClientRect();
          const across = Math.min(r.right, h.right) - Math.max(r.left, h.left);
          const down = Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top);
          if (across > 0 && down > 0) {
            hits.push(`${label.parentElement?.dataset.building}@${opacity.toFixed(2)} (${Math.round(across)}x${Math.round(down)}px)`);
          }
        }
      }
      if (Math.abs(scene.getBoundingClientRect().top) > 1) throw new Error("the route scene is not pinned on screen");
      return hits;
    },
    { top: y, duration: ms },
  );
}

/**
 * Scroll to `y`, then for `ms` check every animation frame of the caption swap the scrub
 * runs into: caption lines of different stops that are both on screen (seen at 0.3 or
 * more, inside every clip around them) never print over each other, every caption line on
 * screen meets WCAG AA on the night ground (4.5:1, 3:1 for large text), and at most one
 * record (1024 to 1279px) is on screen. Returns the frames that broke a rule, as strings.
 */
async function captionFrames(page: Page, y: number, ms: number): Promise<string[]> {
  return page.evaluate(
    async ({ top, duration }) => {
      type Box = { left: number; top: number; right: number; bottom: number };
      const GROUND = [7, 35, 28] as const; // --night-0, the scene's ground
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = ([r, g, b]: readonly number[]) => 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
      const seen = (element: Element) => {
        let opacity = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.visibility === "hidden" || style.display === "none") return 0;
          opacity *= Number(style.opacity);
        }
        return opacity;
      };
      // One inset() length: px, % of the box side, or calc() of those.
      const length = (token: string, side: number) => {
        let sum = 0;
        for (const [, sign, value, unit] of token.matchAll(/([+-])?\s*(-?[\d.]+)(px|%)/g)) {
          const amount = unit === "%" ? (Number(value) / 100) * side : Number(value);
          sum += sign === "-" ? -amount : amount;
        }
        return sum;
      };
      // The box an element's inset() clip leaves on screen (or the whole viewport).
      const clipBox = (element: Element): Box | null => {
        const clip = getComputedStyle(element).clipPath;
        if (!clip.startsWith("inset(")) return null;
        const tokens = clip.slice(6, -1).split(/\s+(?![^(]*\))/);
        const [t = "0px", r = t, b = t, l = r] = tokens;
        const box = element.getBoundingClientRect();
        const w = (element as HTMLElement).offsetWidth;
        const h = (element as HTMLElement).offsetHeight;
        return {
          left: box.left + length(l, w),
          top: box.top + length(t, h),
          right: box.right - length(r, w),
          bottom: box.bottom - length(b, h),
        };
      };
      const meet = (a: Box, b: Box): Box => ({
        left: Math.max(a.left, b.left),
        top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right),
        bottom: Math.min(a.bottom, b.bottom),
      });
      const shows = (box: Box) => box.right - box.left > 2 && box.bottom - box.top > 2;
      const visible = (element: Element, box: Box) => {
        let part = box;
        for (let node: Element | null = element; node && !node.matches("[data-route-stops]"); node = node.parentElement) {
          const clip = clipBox(node);
          if (clip) part = meet(part, clip);
        }
        return shows(part) ? part : null;
      };

      const stops = [...document.querySelectorAll<HTMLElement>("[data-route-stop]")];
      if (stops.length !== 4) throw new Error("no route captions");
      const hits = new Set<string>();
      window.scrollTo({ top, behavior: "instant" });
      const end = performance.now() + duration;
      while (performance.now() < end) {
        await new Promise(requestAnimationFrame);
        const lines: Array<{ stop: string; text: string; opacity: number; box: Box }> = [];
        for (const stop of stops) {
          const walker = document.createTreeWalker(stop.querySelector("[data-route-text]")!, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const element = node.parentElement;
            const text = node.textContent?.trim() ?? "";
            if (!element || !text) continue;
            const opacity = seen(element);
            if (opacity < 0.001) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              const box = visible(element, rect);
              if (!box) continue;
              const style = getComputedStyle(element);
              const size = Number.parseFloat(style.fontSize);
              const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
              const fg = (style.color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
              const shown = fg.map((value, i) => opacity * value + (1 - opacity) * GROUND[i]!);
              const ratio = (luminance(shown) + 0.05) / (luminance(GROUND) + 0.05);
              if (ratio < (large ? 3 : 4.5)) hits.add(`contrast ${stop.dataset.routeStop} "${text.slice(0, 12)}" ${ratio.toFixed(2)}:1`);
              lines.push({ stop: stop.dataset.routeStop ?? "?", text, opacity, box });
            }
          }
        }
        for (const [i, a] of lines.entries()) {
          for (const b of lines.slice(i + 1)) {
            if (a.stop === b.stop || a.opacity < 0.3 || b.opacity < 0.3) continue;
            if (shows(meet(a.box, b.box))) hits.add(`overlap ${a.stop} "${a.text.slice(0, 12)}" x ${b.stop} "${b.text.slice(0, 12)}"`);
          }
        }
        const records = stops.filter((stop) => {
          const record = stop.querySelector(".route-record");
          return record && seen(record) >= 0.3 && visible(record, record.getBoundingClientRect());
        });
        if (records.length > 1) hits.add(`records ${records.map((stop) => stop.dataset.routeStop).join("+")} at once`);
      }
      return [...hits];
    },
    { top: y, duration: ms },
  );
}

const summary = (page: Page) => page.locator("[data-plate-summary]").first();
const stop = (page: Page, key: "A" | "B" | "C" | "D") => page.locator(`[data-route-stop="${key}"]`);
const tag = (page: Page, building: "apm" | "cheongpyeonghwa") =>
  page.locator(`[data-route-camera] .route-tags [data-building="${building}"] [data-route-tag]`);
const tick = (page: Page, building: "apm" | "cheongpyeonghwa", floor: number) =>
  page.locator(`[data-route-camera] svg [data-building="${building}"] [data-floor="${floor}"]`);

test.describe("route everywhere", () => {
  test("renders the heading and all four captions in the DOM, in order", async ({ page }) => {
    await openPage(page);
    const section = page.locator("#route");
    await expect(section.locator("h2")).toHaveAccessibleName(route.h2.join(" "));

    const texts = await section.locator("[data-route-stop]").evaluateAll((items) =>
      items.map((item) => ({ key: item.getAttribute("data-route-stop"), text: item.textContent ?? "" })),
    );
    expect(texts.map((item) => item.key)).toEqual(["A", "B", "C", "D"]);
    const [a, b, c, d] = route.stops;
    expect(texts[0]?.text).toContain(a.quote);
    expect(texts[0]?.text).toContain(a.attribution);
    expect(texts[0]?.text).toContain(a.caption);
    expect(texts[1]?.text).toContain(b.time);
    expect(texts[1]?.text).toContain(b.place);
    expect(texts[1]?.text).toContain(b.caption);
    expect(texts[2]?.text).toContain(c.time);
    expect(texts[2]?.text).toContain(c.place);
    expect(texts[2]?.text).toContain(c.caption);
    expect(texts[3]?.text).toContain(d.time);
    expect(texts[3]?.text).toContain(d.caption);

    const rendered = (await section.textContent()) ?? "";
    expect(rendered).not.toMatch(/[–—]/);
  });
});

test.describe("route on desktop", () => {
  onlyIn("desktop");

  test("moves the ledger only at 03:06 and restores every beat when scrubbed back", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPage(page);

    await toPin(page, 0.2);
    await expectBeat(page, "b2330");
    await expectRail(page, "b2330");

    // 02:16: the cardigan card joins the rail; the denim plate does not move.
    await toPin(page, 0.36);
    await expectBeat(page, "b0216");
    await expect(summary(page)).toHaveText(summaryAt("b2330"));
    await expect(summary(page)).toContainText("확보 0장");
    await expectRail(page, "b0216");
    await expect(page.locator('[data-rail-entry="r0216"]')).toContainText(RECORDS.r0216.title);

    // 03:06: the denim record moves the ledger.
    await toPin(page, 0.7);
    await expectBeat(page, "b0306");
    await expect(summary(page)).toContainText("확보 2장");
    await expect(summary(page)).toContainText("남은 미송 4장");
    await expectRail(page, "b0306");
    await expect(page.locator('[data-rail-entry="r0306"]')).toContainText(RECORDS.r0306.title);
    await page.screenshot({ path: testInfo.outputPath("route-desktop-0306.png") });

    // 03:07: the bubble joins the rail; the plate stays exactly as it was.
    await toPin(page, 0.93);
    await expectBeat(page, "b0307");
    await expect(summary(page)).toHaveText(summaryAt("b0306"));
    await expectRail(page, "b0307");
    await expect(page.locator('[data-rail-entry="m0307"]')).toContainText(RECORDS.m0307.title);
    await page.screenshot({ path: testInfo.outputPath("route-desktop-0307.png") });

    // Back from 03:07 to 02:16: m0307 and r0306 leave, 확보 is 0 again, r0216 stays.
    await toPin(page, 0.45);
    await expectBeat(page, "b0216");
    await expectRail(page, "b0216");
    await expect(page.locator('[data-rail-entry="m0307"]')).toHaveCount(0);
    await expect(page.locator('[data-rail-entry="r0306"]')).toHaveCount(0);
    await expect(summary(page)).toContainText("확보 0장");

    // Back to before 02:16: the cardigan card leaves too.
    await toPin(page, 0.3);
    await expectBeat(page, "b2330");
    await expectRail(page, "b2330");
    await expect(page.locator('[data-rail-entry="m0307"]')).toHaveCount(0);
    await expect(page.locator('[data-rail-entry="r0306"]')).toHaveCount(0);
    await expect(summary(page)).toContainText("확보 0장");

    expect(errors).toEqual([]);
  });

  test("turns the pin on and off without a layout shift, and opens on a lit map", async ({ page }) => {
    // A pinned element that clips its own overflow reports a full-viewport shift each time
    // the pin switches to position: fixed and back (field CLS); route.css clips its child.
    await page.addInitScript(() => {
      type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: ReadonlyArray<{ node: Node | null }> };
      const shifts: Array<{ value: number; route: boolean }> = [];
      Reflect.set(window, "__routeShifts", shifts);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Shift[]) {
          if (entry.hadRecentInput) continue;
          const route = entry.sources.some((source) => source.node instanceof Element && source.node.closest("#route") !== null);
          shifts.push({ value: entry.value, route });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openPage(page);
    const routeShift = () =>
      page.evaluate(() =>
        (Reflect.get(window, "__routeShifts") as Array<{ value: number; route: boolean }>)
          .filter((shift) => shift.route)
          .reduce((sum, shift) => sum + shift.value, 0),
      );

    await toPin(page, -0.2);
    const before = await routeShift();
    // The drawing is lit by the pin start (it comes up while the section enters).
    await toPin(page, 0.01);
    await expect
      .poll(() => page.locator("[data-route-camera] > svg").first().evaluate((svg) => Number(getComputedStyle(svg).opacity)))
      .toBeGreaterThan(0.95);
    for (const progress of [0.5, 1.15, 0.5, -0.2]) await toPin(page, progress);
    expect((await routeShift()) - before).toBeLessThan(0.01);
  });

  test("keeps the lamp on the route at every progress and after a resize", async ({ page }) => {
    // A resize refreshes every pin on the page; give a busy machine time for it.
    const settled = { timeout: 20_000 };
    await openPage(page);
    for (const progress of [0.2, 0.3, 0.45, 0.58, 0.8, 1]) {
      await toPin(page, progress);
      await expect.poll(() => lampDistance(page), { message: `lamp off the route at ${progress}`, ...settled }).toBeLessThan(1.5);
    }

    await toPin(page, 0.58);
    await page.setViewportSize({ width: 1280, height: 800 });
    await settle(page);
    await expect.poll(() => lampDistance(page), { message: "lamp off the route after resizing to 1280", ...settled }).toBeLessThan(1.5);
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page);
    await expect.poll(() => lampDistance(page), { message: "lamp off the route after resizing back", ...settled }).toBeLessThan(1.5);
    for (const progress of [0.4, 0.75]) {
      await toPin(page, progress);
      await expect.poll(() => lampDistance(page), settled).toBeLessThan(1.5);
    }
  });

  test("swaps captions, pops tags and lights floor ticks with the lamp, both ways", async ({ page }, testInfo) => {
    await openPage(page);
    const current = (key: "A" | "B" | "C" | "D") => expect(stop(page, key)).toHaveAttribute("data-current", "");

    await toPin(page, 0.1);
    await current("A");
    await expect(tag(page, "apm")).toBeHidden();
    await expect(tick(page, "apm", 4)).not.toHaveAttribute("data-lit");

    // The lamp is still walking to APM: the caption keeps 23:30's profile line, like the plate.
    await toPin(page, 0.25);
    await current("A");
    await expectBeat(page, "b2330");

    await toPin(page, 0.42);
    await current("B");
    await expect(tag(page, "apm")).toBeVisible();
    await expect(tag(page, "apm")).toContainText(route.stops[1].tag);
    await expect(tag(page, "cheongpyeonghwa")).toBeHidden();
    await expect(tick(page, "apm", 4)).toHaveAttribute("data-lit", "");
    await expect(tick(page, "cheongpyeonghwa", 1)).not.toHaveAttribute("data-lit");
    await page.screenshot({ path: testInfo.outputPath("route-desktop-0216.png") });

    // Walking on to 청평화: still the 02:16 caption, as the plate still reads 02:16 · 확보 0.
    await toPin(page, 0.6);
    await current("B");
    await expectBeat(page, "b0216");
    await expect(tag(page, "cheongpyeonghwa")).toBeHidden();

    await toPin(page, 0.75);
    await current("C");
    await expect(tag(page, "cheongpyeonghwa")).toBeVisible();
    await expect(tag(page, "cheongpyeonghwa")).toContainText(route.stops[2].tag);
    await expect(tick(page, "cheongpyeonghwa", 1)).toHaveAttribute("data-lit", "");

    await toPin(page, 0.95);
    await current("D");

    await toPin(page, 0.1);
    await current("A");
    await expect(tag(page, "apm")).toBeHidden();
    await expect(tag(page, "cheongpyeonghwa")).toBeHidden();
    await expect(tick(page, "apm", 4)).not.toHaveAttribute("data-lit");
    await expect(tick(page, "cheongpyeonghwa", 1)).not.toHaveAttribute("data-lit");
  });

  test("swaps captions without two ever printing over each other, at full contrast, both ways", async ({ page }) => {
    // The leaving caption is wiped away before the arriving one opens, so every frame of
    // every swap (and of the records beside the captions below 1280px) stays legible.
    test.setTimeout(180_000);
    // One stop at a time both ways, then fast scrubs that cross two or three swaps at once.
    const swaps = [
      [0.28, 0.36],
      [0.62, 0.7],
      [0.86, 0.94],
      [0.94, 0.86],
      [0.7, 0.62],
      [0.36, 0.28],
      [0.1, 0.96],
      [0.96, 0.45],
      [0.45, 0.1],
    ] as const;
    const keys = ["A", "B", "C", "D"] as const;
    // At rest: the current caption whole, the previous one as the ghost, the others hidden.
    const resting = (index: number) =>
      keys.map((key, n) => (n === index ? `${key}:1` : n === index - 1 ? `${key}:0.42` : `${key}:hidden`));
    const restState = () =>
      page.locator("[data-route-stop]").evaluateAll((items) =>
        items.map((item) => {
          const style = getComputedStyle(item);
          const text = getComputedStyle(item.querySelector("[data-route-text]")!);
          const open = item.hasAttribute("data-current") ? text.clipPath === "inset(-32px)" : true;
          const shown = style.visibility === "hidden" ? "hidden" : `${Math.round(Number(style.opacity) * 100) / 100}`;
          return `${item.getAttribute("data-route-stop")}:${open ? shown : `clipped ${text.clipPath}`}`;
        }),
      );
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await openPage(page);
      for (const [from, to] of swaps) {
        await toPin(page, from);
        // scrub: 1 eases the film for about a second, then the swap runs.
        await page.waitForTimeout(1600);
        const frames = await captionFrames(page, await pinScroll(page, to), 2000);
        expect(frames, `${from} to ${to} at ${viewport.width}x${viewport.height}`).toEqual([]);
        await expect.poll(restState, { message: `rest at ${to}` }).toEqual(resting(captionIndex(to)));
      }
    }
  });

  test("keeps every map label off the heading while the camera settles, both ways", async ({ page }) => {
    // From the S2 frame to the round framing the camera carries APM's name up under the
    // heading's second line; a name waits, unseen, until the camera has carried it clear.
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      const size = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);
      await openPage(page);
      await toPin(page, 0);
      // scrub: 1 eases the film for about a second after the scroll lands.
      expect(await labelsOverHeading(page, await pinScroll(page, CAMERA_END + 0.05), 2000), `forward at ${size}`).toEqual([]);
      // Settled on the round, the names on it are at full strength.
      await toPin(page, CAMERA_END + 0.05);
      for (const building of ["apm", "cheongpyeonghwa"] as const) {
        const name = page.locator(`[data-route-camera] .route-labels [data-building="${building}"] > *`);
        await expect
          .poll(() => name.evaluate((element) => Number(getComputedStyle(element).opacity) * Number(getComputedStyle(element.parentElement!).opacity)))
          .toBeGreaterThan(0.95);
      }
      expect(await labelsOverHeading(page, await pinScroll(page, 0), 2000), `backward at ${size}`).toEqual([]);
    }
  });

  test("rests keyboard pages on every stop, both ways, so 03:06 is never stepped over", async ({ page }) => {
    // A native page is about half the pin: from 02:16 it would land on 03:07.
    await openPage(page);
    await toPin(page, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const press = async (key: "PageDown" | "PageUp", expected: "A" | "B" | "C" | "D") => {
      await page.keyboard.press(key);
      await settle(page);
      await expect(stop(page, expected), `${key} rests on ${expected}`).toHaveAttribute("data-current", "");
    };

    await press("PageDown", "B");
    await press("PageDown", "C");
    await expectBeat(page, "b0306");
    await expect(tag(page, "cheongpyeonghwa")).toBeVisible();
    await press("PageDown", "D");
    await press("PageUp", "C");
    await press("PageUp", "B");
    await press("PageUp", "A");
  });
});

test.describe("route leaving the pinned film", () => {
  onlyIn("desktop");

  const allShown = ["A:1:", "B:1:", "C:1:", "D:1:"];

  test("keeps every caption when the window drops below 1024px mid-pin", async ({ page }) => {
    await openPage(page);
    await toPin(page, 0.6);
    await expect(stop(page, "B")).toHaveAttribute("data-current", "");
    expect(await stopStates(page)).not.toEqual(allShown);

    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(() => stopStates(page)).toEqual(allShown);
    // No late caption tween may write the hidden state back.
    await page.waitForTimeout(1200);
    expect(await stopStates(page)).toEqual(allShown);
    await expect(page.locator("[data-route-stop][data-current]")).toHaveCount(0);

    await stop(page, "C").scrollIntoViewIfNeeded();
    await expect(stop(page, "C").locator(".route-caption")).toBeVisible();
  });

  test("keeps every caption, tag and lit tick when reduced motion is switched on mid-pin", async ({ page }) => {
    await openPage(page);
    await toPin(page, 0.6);
    await expect(tag(page, "cheongpyeonghwa")).toBeHidden();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => stopStates(page)).toEqual(allShown);
    await page.waitForTimeout(1200);
    expect(await stopStates(page)).toEqual(allShown);

    await stop(page, "A").scrollIntoViewIfNeeded();
    await expect(tag(page, "apm")).toBeVisible();
    await expect(tag(page, "cheongpyeonghwa")).toBeVisible();
    await expect(tick(page, "apm", 4)).toHaveAttribute("data-lit", "");
    await expect(tick(page, "cheongpyeonghwa", 1)).toHaveAttribute("data-lit", "");
  });

  test("keeps the drawn route and the lamp at 청평화 when a rebuilt film is left for reduced motion", async ({ page }) => {
    // A refresh re-initialises the film's tweens, and GSAP's revert restores whatever the
    // route mask carried at that moment; the static map must still show the whole round.
    const camera = page.locator("[data-route-camera]");
    const maskDash = () => camera.locator(".map-route-mask").evaluate((mask) => getComputedStyle(mask).strokeDasharray);
    const lamp = () =>
      camera.locator("[data-route-dot]").evaluate((dot) => {
        const style = getComputedStyle(dot);
        return `${style.transform}|${style.opacity}|${style.visibility}`;
      });
    const pinned = () => expect(page.locator(".route-root")).toHaveAttribute("data-route-mode", "pinned");
    const leaveForReduced = async (when: string) => {
      await toPin(page, 0.75);
      await expect.poll(maskDash, { message: `the film draws the round (${when})` }).not.toBe("none");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator(".route-root")).not.toHaveAttribute("data-route-mode");
      await expect.poll(maskDash, { message: `route undrawn after leaving (${when})` }).toBe("none");
      expect(await lamp()).toBe("none|1|visible");
    };

    await openPage(page);
    await leaveForReduced("first film");

    // Built again by switching reduced motion off.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await pinned();
    await leaveForReduced("rebuilt after reduced motion");

    // Built again by a resize below 1024px and back.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await pinned();
    await toPin(page, 0.75);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator(".route-root")).not.toHaveAttribute("data-route-mode");
    await page.setViewportSize({ width: 1440, height: 900 });
    await pinned();
    await settle(page);
    await leaveForReduced("rebuilt after a resize");

    await camera.scrollIntoViewIfNeeded();
    await expect(tag(page, "apm")).toBeVisible();
    await expect(tag(page, "cheongpyeonghwa")).toBeVisible();
  });

  test("lands a #route deep link on the settled round framing, lamp lit", async ({ page }) => {
    await page.goto("/#route");
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    await settle(page);
    await expect.poll(() => pinProgress(page), { timeout: 15_000 }).toBeGreaterThan(0.1);
    const progress = await pinProgress(page);
    expect(progress).toBeLessThan(0.2);
    await expect(stop(page, "A")).toHaveAttribute("data-current", "");
    await expect.poll(() => page.locator("[data-route-dot]").evaluate((dot) => getComputedStyle(dot).opacity)).toBe("1");
  });
});

test.describe("route on mobile", () => {
  onlyIn("mobile");

  test("has no pin and reports a beat per stop block, in order and back", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPage(page);
    const scene = page.locator("[data-route-scene]");
    expect(await scene.evaluate((element) => element.parentElement?.classList.contains("pin-spacer") ?? false)).toBe(false);

    const blocks: Array<[Locator, BeatId, BeatId]> = [
      [page.locator('[data-stop-beat="b0216"]'), "b0216", "b2330"],
      [page.locator('[data-stop-beat="b0306"]'), "b0306", "b0216"],
      [page.locator('[data-stop-beat="b0307"]'), "b0307", "b0306"],
    ];

    await centreOn(page, stop(page, "A"), 0);
    await expectBeat(page, "b2330");

    for (const [block, beat] of blocks) {
      // The 03:07 message moves nothing on the map, so its block has no crop.
      if (beat === "b0307") await expect(block.locator(".route-crop")).toHaveCount(0);
      else await expect(block.locator(".route-crop")).toBeVisible();
      await centreOn(page, block, 24);
      await expectBeat(page, beat);
    }
    await page.screenshot({ path: testInfo.outputPath("route-mobile-0307.png") });

    for (const [block, , before] of [...blocks].reverse()) {
      await centreOn(page, block, -24);
      await expectBeat(page, before);
    }

    expect(errors).toEqual([]);
  });
});

test.describe("route with reduced motion", () => {
  onlyIn("reduced-motion");

  test("shows the end state without a pin and reports beats per caption", async ({ page }, testInfo) => {
    await openPage(page);
    const scene = page.locator("[data-route-scene]");
    expect(await scene.evaluate((element) => element.parentElement?.classList.contains("pin-spacer") ?? false)).toBe(false);

    // Route fully drawn, both tags shown, both arrival ticks lit, every caption visible.
    const dash = await page
      .locator("[data-route-camera] .map-route-mask")
      .evaluate((element) => getComputedStyle(element).strokeDasharray);
    expect(dash).toBe("none");
    await stop(page, "A").scrollIntoViewIfNeeded();
    await expect(tag(page, "apm")).toBeVisible();
    await expect(tag(page, "cheongpyeonghwa")).toBeVisible();
    await expect(tick(page, "apm", 4)).toHaveAttribute("data-lit", "");
    await expect(tick(page, "cheongpyeonghwa", 1)).toHaveAttribute("data-lit", "");
    for (const key of ["A", "B", "C", "D"] as const) {
      await expect(stop(page, key)).toBeVisible();
      expect(await stop(page, key).evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    }

    for (const [selector, beat] of [
      ['[data-stop-beat="b0216"]', "b0216"],
      ['[data-stop-beat="b0306"]', "b0306"],
      ['[data-stop-beat="b0307"]', "b0307"],
    ] as const) {
      await centreOn(page, page.locator(selector), 24);
      await expectBeat(page, beat);
    }
    await page.screenshot({ path: testInfo.outputPath("route-reduced.png") });

    await centreOn(page, page.locator('[data-stop-beat="b0216"]'), -24);
    await expectBeat(page, "b2330");
  });
});
