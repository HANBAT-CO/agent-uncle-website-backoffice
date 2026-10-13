import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { getMapView, type MapBuildingId } from "../../src/components/map/views";
import { LATE_INTRO_MS } from "../../src/components/sections/hero/hero-config";
import { hero, plate } from "../../src/content/copy";
import { expectBeat } from "./chrome-helpers";

/**
 * S1 hero (WP-10): the framed 22:00 night map, the lens and its readout, the
 * record card proxies and the dive.
 *
 * desktop (1440x900): the H1 sits on two lines and is painted with the CTAs
 *   in the first viewport; hovering a building moves the readout to its
 *   record and leaving returns it to 청평화; Tab reaches the building buttons
 *   and moves the lens; the dive pins, the proxies land on the rail slots and
 *   hand over to the rail's own entries, and scrolling back restores them,
 *   leaving exactly two rail entries throughout.
 * mobile (390x844): three H1 lines, the CTA above the fold, chips swap the
 *   readout, nothing pins.
 * reduced-motion: no pin, no draw-in, a static lens moved by the buttons.
 * Also: the draw-in survives the load's ScrollTrigger refreshes but never
 * runs once the page has scrolled into the dive, every building button takes
 * the pointer at its own centre (the H1 never sits on 남평화's), the readout
 * never slides across the text on its way, a resize mid-dive leaves the
 * readout clear of the text, the
 * honesty line clears the compact plate, the dive ends on S2's first frame,
 * and the phone lens sits on the building its readout names. On 1280x800,
 * 1366x768, 1024x768 and 1440x900 the scaling dot never crosses text above
 * 40% opacity; a pointer-led lens keeps off the text; the pin ends on the lit
 * 청평화 with the cards still flying in its last third, and holds it until
 * S2's heading is half on screen; a phone pan leaves no label cut at the
 * frame's edge or under the nav pill.
 *
 * Hero hooks: [data-hero-pin] (pinned on desktop motion), [data-hero-map-box=
 * desktop|mobile], [data-hero-readout=float|dock][data-shown] with items
 * [data-readout=<id>][data-state=active], [data-building-button=<id>],
 * [data-building-chip=<id>], [data-rail-proxy=<record id>], the section's
 * data-proxy-done; the rail's [data-rail-slot] and [data-rail-entry] (WP-02).
 */

const desktopView = getMapView("hero-desktop");

function onlyIn(...projects: string[]) {
  test.beforeEach(({}, testInfo) => {
    test.skip(!projects.includes(testInfo.project.name), `${projects.join(", ")} only`);
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

async function openHero(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.locator("[data-record-column]").waitFor({ state: "attached" });
  await expect.poll(() => railEntries(page)).toEqual(["r2005", "r2031"]);
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await page.locator('[data-hero-readout="float"] .hero-readout-card').waitFor({ state: "attached" });
    await expect(page.locator("[data-building-button]")).toHaveCount(4);
  } else {
    await page.locator('[data-hero-readout="dock"]').waitFor({ state: "attached" });
    await expect(page.locator("[data-building-chip]")).toHaveCount(4);
  }
  await page.evaluate(() => document.fonts.ready);
}

/** Resolve once the page has stopped scrolling (Lenis eases after a jump). */
async function settle(page: Page): Promise<void> {
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

/** Scroll the desktop hero pin to `progress` (0..1) and let the 0.6s scrub catch up. */
async function toPin(page: Page, progress: number): Promise<void> {
  // After a resize the pin's spacing follows on ScrollTrigger's debounced refresh: wait for it (+=100%).
  await page.waitForFunction(
    () => {
      const pin = document.querySelector<HTMLElement>("[data-hero-pin]");
      const spacer = pin?.parentElement;
      return !!pin && !!spacer && Math.abs(spacer.offsetHeight - pin.offsetHeight - window.innerHeight) <= 1;
    },
    undefined,
    { timeout: 10_000 },
  );
  const top = await page.evaluate((p) => {
    const spacer = document.querySelector("[data-hero-pin]")?.parentElement;
    if (!spacer?.classList.contains("pin-spacer")) throw new Error("the hero is not pinned");
    return Math.round(p * (spacer.offsetHeight - window.innerHeight));
  }, progress);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await settle(page);
  await page.waitForTimeout(900);
}

async function readout(page: Page, variant: "float" | "dock") {
  return page.locator(`[data-hero-readout="${variant}"] [data-state="active"] .hero-readout-place`);
}

/** Move the pointer onto a building's roof on the desktop map. */
async function hoverRoof(page: Page, id: MapBuildingId): Promise<void> {
  const box = await page.locator('[data-hero-map-box="desktop"]').boundingBox();
  if (!box) throw new Error("no desktop map box");
  const roof = desktopView.buildings.find((building) => building.id === id)?.roof;
  if (!roof) throw new Error(`no roof for ${id}`);
  const x = box.x + (roof[0] / desktopView.viewBox.width) * box.width;
  // A little below the roof centre: inside the building's prism.
  const y = box.y + (roof[1] / desktopView.viewBox.height) * box.height + 24;
  await page.mouse.move(x, y, { steps: 8 });
}

/** Each proxy covers its rail slot within 1.5px (position and size). */
async function expectProxiesOnSlots(page: Page): Promise<void> {
  for (const id of ["r2005", "r2031"]) {
    const proxy = await page.locator(`[data-rail-proxy="${id}"]`).boundingBox();
    const slot = await page.locator(`[data-rail-slot="${id}"]`).boundingBox();
    expect(proxy, `proxy ${id}`).not.toBeNull();
    expect(slot, `slot ${id}`).not.toBeNull();
    if (!proxy || !slot) continue;
    expect(Math.abs(proxy.x - slot.x)).toBeLessThan(1.5);
    expect(Math.abs(proxy.y - slot.y)).toBeLessThan(1.5);
    expect(Math.abs(proxy.width - slot.width)).toBeLessThan(1.5);
    expect(Math.abs(proxy.height - slot.height)).toBeLessThan(1.5);
  }
}

async function railEntries(page: Page): Promise<string[]> {
  return page.locator("[data-rail-entry]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-rail-entry") ?? ""));
}

/** Overlap of the float readout card with any visible [data-readout-obstacle] in the hero. */
async function readoutHits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-hero-readout="float"] .hero-readout-card')?.getBoundingClientRect();
    if (!card) return ["no card"];
    return [...document.querySelectorAll<HTMLElement>("[data-hero-pin] [data-readout-obstacle]")]
      .filter((element) => element.offsetParent !== null)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < card.right && card.left < rect.right && rect.top < card.bottom && card.top < rect.bottom;
      })
      .map((element) => String(element.className));
  });
}

/** Each desktop building button is the topmost element at its own centre. */
async function buttonHits(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-building-button]")].map((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const ok = hit !== null && (hit === button || button.contains(hit));
        return [button.dataset.buildingButton ?? "", ok ? "ok" : hit ? `${hit.tagName}#${hit.id}.${String(hit.className)}` : "none"];
      }),
    ),
  );
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`) });
}

test.describe("hero: shared", () => {
  test("paints the one-liner H1, the sub and both CTAs, with the honesty line and the map caption", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openHero(page);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveAccessibleName(`${hero.h1[0]} ${hero.h1[1]}`);
    await expect(page.getByText(hero.sub)).toBeVisible();
    await expect(page.locator("[data-hero-ctas]").getByRole("link", { name: hero.ctaPrimary.label })).toHaveAttribute("href", "#signup");
    await expect(page.locator("[data-hero-ctas]").getByRole("link", { name: hero.ctaSecondary.label })).toHaveAttribute("href", "#film");
    await expect(page.getByText(hero.honesty)).toBeVisible();
    await expect(page.locator('[data-section="hero"] figcaption')).toHaveCount(1);
    // The hero reports 22:00: the plate reads the open request (요청 6, 미확인 6), at night.
    await expectBeat(page, "b2200");
    // The H1 has no entrance animation: fully opaque and in place on first paint.
    expect(await h1.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
    await shot(page, testInfo, "hero-top");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

test.describe("hero: desktop", () => {
  onlyIn("desktop");

  test("H1 on two lines and the CTAs in the first viewport", async ({ page }) => {
    await openHero(page);
    const h1 = page.locator("h1");
    const { height, lineHeight } = await h1.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(height).toBeLessThan(lineHeight * 2.4);
    expect(height).toBeGreaterThan(lineHeight * 1.6);
    const cta = await page.locator("[data-hero-ctas]").boundingBox();
    expect(cta && cta.y + cta.height).toBeLessThanOrEqual(900);
  });

  test("the lens reads the record under the pointer and rests on 청평화", async ({ page }) => {
    await openHero(page);
    // The draw-in ends with the lens fading in (the scrub may rest a hair under 1).
    await expect
      .poll(() => page.locator('[data-hero-lens="desktop"]').evaluate((node) => Number(getComputedStyle(node).opacity)), { timeout: 8000 })
      .toBeGreaterThan(0.99);

    await hoverRoof(page, "apm");
    await expect(await readout(page, "float")).toHaveText(hero.lens.apm.place, { timeout: 700 });
    await hoverRoof(page, "cheongpyeonghwa");
    await expect(await readout(page, "float")).toHaveText(hero.lens.cheongpyeonghwa.place, { timeout: 700 });
    await hoverRoof(page, "nampyeonghwa");
    await expect(await readout(page, "float")).toHaveText(hero.lens.nampyeonghwa.place, { timeout: 700 });

    // Leaving the stage glides the lens home.
    await page.mouse.move(4, 450, { steps: 4 });
    await expect(await readout(page, "float")).toHaveText(hero.lens.cheongpyeonghwa.place);
  });

  test("Tab reaches the building buttons and moves the lens", async ({ page }) => {
    await openHero(page);
    await page.locator("[data-hero-ctas] a").last().focus();
    let reached = false;
    for (let step = 0; step < 6 && !reached; step += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.getAttribute("data-building-button") === "apm");
    }
    expect(reached).toBe(true);
    await expect(await readout(page, "float")).toHaveText(hero.lens.apm.place);
    await expect(page.locator('[data-building-button="apm"]')).toHaveAttribute("aria-pressed", "true");
    // Buttons follow the map from west to east: APM, then 청평화.
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-building-button="cheongpyeonghwa"]')).toBeFocused();
    await expect(await readout(page, "float")).toHaveText(hero.lens.cheongpyeonghwa.place);
  });

  test("the readout never slides across the text block or the record cards on its way", async ({ page }) => {
    await openHero(page);
    await expect
      .poll(() => page.locator('[data-hero-lens="desktop"]').evaluate((node) => Number(getComputedStyle(node).opacity)), { timeout: 8000 })
      .toBeGreaterThan(0.99);
    // West of 청평화 to below 디오트: the straight way crosses the H1's first line.
    const worst = await page.evaluate(async () => {
      const card = document.querySelector<HTMLElement>('[data-hero-readout="float"] .hero-readout-card');
      if (!card) return -1;
      const blocked = [...document.querySelectorAll<HTMLElement>("[data-hero-pin] [data-readout-obstacle]")]
        .filter((element) => element.offsetParent !== null)
        .map((element) => element.getBoundingClientRect());
      document.querySelector<HTMLElement>('[data-building-button="diot"]')?.focus();
      let most = 0;
      const start = performance.now();
      while (performance.now() - start < 1100) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (Number(getComputedStyle(card).opacity) < 0.1) continue;
        const rect = card.getBoundingClientRect();
        for (const other of blocked) {
          const width = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
          const height = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
          if (width > 0 && height > 0) most = Math.max(most, width * height);
        }
      }
      return most;
    });
    expect(worst, "px² of visible card over the text or the record cards").toBe(0);
    await expect(await readout(page, "float")).toHaveText(hero.lens.diot.place);
  });

  test("the dive hands the two record cards to the rail and back", async ({ page }, testInfo) => {
    await openHero(page);
    expect(await railEntries(page)).toEqual(["r2005", "r2031"]);
    await expect(page.locator("[data-record-column]")).toHaveAttribute("data-hero-handoff", "");

    // Landed: each proxy sits on its rail slot.
    await toPin(page, 0.9);
    await expectProxiesOnSlots(page);
    await shot(page, testInfo, "hero-pin-90");

    // End of the pin: the rail's own entries take over.
    await toPin(page, 1);
    await expect(page.locator('[data-section="hero"]')).toHaveAttribute("data-proxy-done", "");
    await expect(page.locator("[data-record-column]")).not.toHaveAttribute("data-hero-handoff", "");
    await expect(page.locator('[data-rail-proxy="r2005"]')).toBeHidden();
    await expect(page.locator('[data-rail-slot="r2005"]')).toBeVisible();
    expect(await railEntries(page)).toEqual(["r2005", "r2031"]);
    await shot(page, testInfo, "hero-pin-end");

    // The whole pin is 22:00.
    await expectBeat(page, "b2200");

    // And back to the top: proxies return to the map, the rail hides its copies again.
    await toPin(page, 0);
    await expect(page.locator('[data-section="hero"]')).not.toHaveAttribute("data-proxy-done", "");
    await expect(page.locator('[data-rail-proxy="r2005"]')).toBeVisible();
    await expect(page.locator("[data-record-column]")).toHaveAttribute("data-hero-handoff", "");
    expect(await railEntries(page)).toEqual(["r2005", "r2031"]);
    const rest = await page.locator('[data-rail-proxy="r2005"]').evaluate((node) => getComputedStyle(node).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(rest);
  });
});

test.describe("hero: desktop, the draw-in and the match cut", () => {
  onlyIn("desktop");

  test("the map draws in over the first seconds instead of popping in drawn", async ({ page }) => {
    // Record, frame by frame, how long the strokes carry DrawSVG's inline dash styles, and when html.js-draw goes.
    await page.addInitScript(() => {
      const state: { first: number | null; last: number | null; removed: number | null } = { first: null, last: null, removed: null };
      (window as unknown as { __heroDraw: typeof state }).__heroDraw = state;
      const tick = () => {
        const path = document.querySelector<SVGElement>('[data-hero-map-box="desktop"] [data-drawable]');
        if (path?.style.strokeDasharray) {
          const now = performance.now();
          state.first ??= now;
          state.last = now;
        }
        if (state.removed === null && (state.first !== null || performance.now() > 1500) && !document.documentElement.classList.contains("js-draw")) {
          state.removed = performance.now();
        }
        if (state.removed === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await openHero(page);
    const draw = await page
      .waitForFunction(() => (window as unknown as { __heroDraw: { removed: number | null } }).__heroDraw.removed !== null, undefined, { timeout: 15_000 })
      .then(() => page.evaluate(() => (window as unknown as { __heroDraw: { first: number | null; last: number | null; removed: number } }).__heroDraw));
    // A hydration slower than LATE_INTRO_MS shows the map drawn on purpose (busy shared dev server).
    test.skip(draw.first === null && draw.removed > LATE_INTRO_MS, `hydrated after ${LATE_INTRO_MS}ms: no draw-in by design`);
    expect(draw.first, "the strokes never carried a dash").not.toBeNull();
    // The draw-in takes about two seconds; the old refresh guard killed it after about 30ms.
    expect((draw.last ?? 0) - (draw.first ?? 0)).toBeGreaterThanOrEqual(400);
  });

  test("scrolling into the dive as the page hydrates shows the map drawn, never drawing it under the tilt", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("non-scaling")) warnings.push(message.text());
    });
    await page.goto("/");
    await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
    await page.evaluate(() => window.scrollTo({ top: Math.round(window.innerHeight * 0.5), behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("js-draw")), { timeout: 10_000 }).toBe(false);
    await page.waitForTimeout(1500);
    const dashed = await page
      .locator('[data-hero-map-box="desktop"] [data-drawable]')
      .evaluateAll((nodes) => nodes.filter((node) => (node as SVGElement).style.strokeDasharray !== "").length);
    expect(dashed).toBe(0);
    expect(warnings).toEqual([]);
  });

  test("the dive ends on S2's first frame: same map, same place", async ({ page }) => {
    await openHero(page);
    await toPin(page, 1);
    const box = (selector: string) =>
      page.locator(selector).evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return [rect.left, rect.top, rect.right, rect.bottom];
      });
    const heroMap = page.locator('[data-hero-map-box="desktop"] [data-hero-map]');
    const end = await box('[data-hero-map-box="desktop"] [data-map-layer="base"] [data-building="cheongpyeonghwa"]');
    await page.evaluate(() => {
      const words = document.querySelector("#words");
      if (words) window.scrollTo({ top: words.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
    });
    await settle(page);
    await page.waitForTimeout(900);
    // By S2's pin the hero has settled into S2's dim copy (it dims as S2's heading comes up).
    await expect(page.locator('[data-section="hero"]')).toHaveAttribute("data-hero-settled", "");
    expect(await heroMap.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeCloseTo(0.25, 2);
    const first = await box('.words-map [data-building="cheongpyeonghwa"]');
    for (let index = 0; index < 4; index += 1) expect(Math.abs(end[index] - first[index])).toBeLessThan(2);
  });

  test("the pin ends on the lit 청평화 and holds it until S2's heading is half on screen", async ({ page }, testInfo) => {
    await openHero(page);
    const heroMap = page.locator('[data-hero-map-box="desktop"] [data-hero-map]');
    const dotFace = page.locator('[data-hero-map-box="desktop"] [data-hero-dot] > [data-dot]');
    const opacity = (locator: typeof heroMap) => locator.evaluate((node) => Number(getComputedStyle(node).opacity));

    // The record cards are still on their way in the pin's last third.
    await toPin(page, 0.75);
    const moving = await page.locator('[data-rail-proxy="r2005"]').evaluate((node) => {
      const slot = document.querySelector('[data-rail-slot="r2005"]')?.getBoundingClientRect();
      const rect = node.getBoundingClientRect();
      return slot ? Math.hypot(rect.left - slot.left, rect.top - slot.top) : 0;
    });
    expect(moving, "px from the proxy to its slot at 0.75").toBeGreaterThan(8);

    // End of the pin: the dive's payoff at full strength.
    await toPin(page, 1);
    expect(await opacity(heroMap)).toBeGreaterThan(0.99);
    expect(await opacity(dotFace)).toBeGreaterThan(0.99);
    await shot(page, testInfo, "hero-pin-end-lit");

    // S2's heading half on screen: the hero still shows the dot (dimming has at most begun).
    const half = await page.evaluate(() => {
      const heading = document.querySelector("#words h2");
      if (!heading) return 0;
      const rect = heading.getBoundingClientRect();
      return Math.round(rect.top + window.scrollY + rect.height / 2 - window.innerHeight);
    });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), half);
    await settle(page);
    await page.waitForTimeout(900);
    expect(await opacity(dotFace)).toBeGreaterThan(0.6);
    await shot(page, testInfo, "hero-seam-h2-half");
  });

  test("a resize mid-dive leaves the readout clear of the text once back at the top", async ({ page }) => {
    await openHero(page);
    expect(await readoutHits(page)).toEqual([]);
    await toPin(page, 0.5);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await settle(page);
    await page.waitForTimeout(900);
    expect(await readoutHits(page)).toEqual([]);
  });

  test("a refresh far down the page never sends the cards to a stale spot on the way back", async ({ page }) => {
    await openHero(page);
    // Refreshes (a resize) while the rail is elsewhere: slid off or holding later entries.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await settle(page);
    await page.setViewportSize({ width: 1440, height: 880 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await toPin(page, 0.9);
    await expectProxiesOnSlots(page);
    // Mid-flight the cards head for the slots, never past the viewport's right edge.
    await toPin(page, 0.5);
    const right = await page.locator('[data-rail-proxy="r2005"]').evaluate((node) => node.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(1440);
  });

  test("the dive keeps the H1 for assistive technology and the faded CTAs in the focus order, off the pointer", async ({ page }) => {
    await openHero(page);
    const cta = page.locator("[data-hero-ctas]").getByRole("link", { name: hero.ctaPrimary.label });
    // At rest, put keyboard focus on the control just before the hero (in the fixed nav).
    await cta.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(cta).not.toBeFocused();
    await toPin(page, 0.5);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(`${hero.h1[0]} ${hero.h1[1]}`);
    // Faded out and off the pointer: what lies under the CTA's centre is not the CTA.
    expect(await page.locator("[data-hero-copy]").evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(0.05);
    const underPointer = await cta.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit !== null && (hit === node || node.contains(hit));
    });
    expect(underPointer).toBe(false);
    // Tab from the nav mid-dive still reaches it, and brings the rest frame back.
    await page.keyboard.press("Tab");
    await expect(cta).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(2);
    await expect(page.locator('[data-section="hero"]')).not.toHaveAttribute("data-hero-dived", "");
  });

  test("Shift+Tab out of S2 lands on the hero's last building button, back at the top", async ({ page }) => {
    await openHero(page);
    const section = page.locator('[data-section="hero"]');
    const wordsTop = await page.evaluate(() => {
      const words = document.querySelector("#words");
      return words ? Math.round(words.getBoundingClientRect().top + window.scrollY) : 0;
    });
    await page.evaluate((y) => window.scrollTo({ top: y + 40, behavior: "instant" }), wordsTop);
    await settle(page);
    await page.waitForTimeout(900);
    await expect(section).toHaveAttribute("data-hero-settled", "");
    // Keyboard-visible focus on S2's first vocabulary pill (Tab away and back onto it).
    await page.locator("[data-vocab]").first().focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("[data-vocab]").first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator('[data-building-button="diot"]')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8000 }).toBeLessThan(2);
    await expect(section).not.toHaveAttribute("data-hero-dive", "");
    // The rest of the hero's controls follow in reverse reading order.
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator('[data-building-button="nampyeonghwa"]')).toBeFocused();
  });

  test("a jump past the settle still settles when a refresh lands mid-scrub", async ({ page }) => {
    await openHero(page);
    const section = page.locator('[data-section="hero"]');
    await toPin(page, 0.3);
    const wordsTop = await page.evaluate(() => {
      const words = document.querySelector("#words");
      return words ? Math.round(words.getBoundingClientRect().top + window.scrollY) : 0;
    });
    // One jump over the whole settle; a resize refresh lands while its scrub is still catching up.
    await page.evaluate((y) => {
      window.scrollTo({ top: y, behavior: "instant" });
      window.dispatchEvent(new Event("resize"));
    }, wordsTop);
    await settle(page);
    await page.waitForTimeout(1200);
    await expect(section).toHaveAttribute("data-hero-settled", "");
    const heroMap = page.locator('[data-hero-map-box="desktop"] [data-hero-map]');
    expect(await heroMap.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeCloseTo(0.25, 2);
    const label = page.locator('[data-hero-map-box="desktop"] .map-label-slot[data-building="cheongpyeonghwa"]');
    expect(await label.evaluate((node) => Number(getComputedStyle(node).opacity))).toBe(0);
  });

  test("keyboard focus on a hero control mid-dive scrolls back to the top", async ({ page }) => {
    await openHero(page);
    await toPin(page, 0.1);
    await page.locator("[data-hero-ctas] a").first().focus();
    // Programmatic focus is not :focus-visible in every engine: arrive by Tab from the control before it.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-hero-ctas] a").first()).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeLessThan(2);
    await expect(page.locator('[data-section="hero"]')).not.toHaveAttribute("data-hero-dive", "");
  });

  test("the record cards are a list of the two 22:00 records until the rail takes over", async ({ page }) => {
    await openHero(page);
    const list = page.locator('[data-section="hero"]').getByRole("list", { name: plate.label });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await toPin(page, 1);
    await expect(page.locator('[data-section="hero"]')).toHaveAttribute("data-proxy-done", "");
    await expect(list.getByRole("listitem")).toHaveCount(0);
  });
});

/**
 * The opacity of the text the lamp dot overlaps (0 when it overlaps none):
 * the dot's box against the glyph runs of the H1 lines, the sub and the CTAs.
 */
async function textUnderDot(page: Page): Promise<number> {
  return page.evaluate(() => {
    const copy = document.querySelector("[data-hero-copy]");
    const dot = document.querySelector('[data-hero-map-box="desktop"] [data-hero-dot]')?.getBoundingClientRect();
    if (!copy || !dot) return -1;
    const runs = [...document.querySelectorAll("#hero-title .hero-h1-line, [data-hero-copy] .hero-sub, [data-hero-ctas] a")].flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()];
    });
    const hit = runs.some((run) => dot.right > run.left && dot.left < run.right && dot.bottom > run.top && dot.top < run.bottom);
    return hit ? Number(getComputedStyle(copy).opacity) : 0;
  });
}

test.describe("hero: desktop, the dive start on common laptops", () => {
  onlyIn("desktop");

  test("the scaling dot never crosses text that is still more than 40% visible", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [width, height] of [
      [1280, 800],
      [1366, 768],
      [1024, 768],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await openHero(page);
      // The draw-in scales the dot in from 0: measure it at rest.
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("js-draw")), { timeout: 10_000 }).toBe(false);
      let worst = 0;
      for (const progress of [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16]) {
        await toPin(page, progress);
        worst = Math.max(worst, await textUnderDot(page));
      }
      expect(worst, `text opacity under the dot at ${width}x${height}`).toBeLessThanOrEqual(0.42);
      await toPin(page, 0);
    }
  });

  test("a pointer-led lens keeps its ring off the text, also on 남평화 right under the H1", async ({ page }) => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await openHero(page);
      await expect
        .poll(() => page.locator('[data-hero-lens="desktop"]').evaluate((node) => Number(getComputedStyle(node).opacity)), { timeout: 8000 })
        .toBeGreaterThan(0.99);
      const label = await page.locator('[data-building-button="nampyeonghwa"]').boundingBox();
      if (!label) throw new Error("no 남평화 label");
      // Just under the label: 남평화's roof.
      await page.mouse.move(label.x + label.width / 2, label.y + label.height + 14, { steps: 10 });
      await page.waitForTimeout(1000);
      await expect(await readout(page, "float")).toHaveText(hero.lens.nampyeonghwa.place);
      const reach = await page.evaluate(() => {
        const lens = document.querySelector('[data-hero-lens="desktop"]')?.getBoundingClientRect();
        if (!lens) return ["no lens"];
        const centre = { x: lens.left + lens.width / 2, y: lens.top + lens.height / 2 };
        const radius = lens.width / 2;
        return [...document.querySelectorAll<HTMLElement>("[data-hero-copy] [data-readout-obstacle]")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const dx = Math.max(rect.left - centre.x, 0, centre.x - rect.right);
            const dy = Math.max(rect.top - centre.y, 0, centre.y - rect.bottom);
            return Math.hypot(dx, dy) < radius - 1;
          })
          .map((element) => String(element.className));
      });
      expect(reach, `${width}x${height}`).toEqual([]);
      await page.mouse.move(4, height / 2, { steps: 2 });
    }
  });
});

test.describe("hero: desktop, 1280 and the CTA", () => {
  onlyIn("desktop");

  test("the proxies land on the narrower rail without a jump", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHero(page);
    await toPin(page, 0.9);
    await expectProxiesOnSlots(page);
    await shot(page, testInfo, "hero-pin-90-1280");
    await toPin(page, 1);
    await expect(page.locator('[data-section="hero"]')).toHaveAttribute("data-proxy-done", "");
    expect(await railEntries(page)).toEqual(["r2005", "r2031"]);
  });

  test("Enter on 사전 신청 goes to the signup section", async ({ page }) => {
    await openHero(page);
    await page.locator("[data-hero-ctas]").getByRole("link", { name: hero.ctaPrimary.label }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#signup$/);
    await settle(page);
    const top = await page.locator("#signup").evaluate((node) => node.getBoundingClientRect().top);
    expect(Math.abs(top)).toBeLessThan(120);
  });

  test("between 1024 and 1279px the honesty line sits clear of the compact plate", async ({ page }) => {
    for (const [width, height] of [
      [1024, 768],
      [1180, 820],
      [1279, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await openHero(page);
      const top = await page.locator("[data-hero-honesty]").evaluate((node) => {
        const element = node as HTMLElement;
        // The line itself ignores the pointer; let it take part in the hit test for a moment.
        element.style.pointerEvents = "auto";
        const rect = element.getBoundingClientRect();
        const hits = [0.05, 0.5, 0.95].map((share) => document.elementFromPoint(rect.left + rect.width * share, rect.top + rect.height / 2));
        element.style.removeProperty("pointer-events");
        return hits.every((hit) => hit !== null && (hit === element || element.contains(hit)));
      });
      expect(top, `honesty line covered at ${width}x${height}`).toBe(true);
    }
  });
});

test.describe("hero: building buttons take the pointer", () => {
  onlyIn("desktop", "reduced-motion");

  test("each button is the topmost element at its centre, the H1 never covers 남평화", async ({ page }) => {
    for (const [width, height] of [
      [1280, 720],
      [1440, 900],
      [1512, 982],
    ]) {
      await page.setViewportSize({ width, height });
      await openHero(page);
      expect(await buttonHits(page), `${width}x${height}`).toEqual({ apm: "ok", cheongpyeonghwa: "ok", nampyeonghwa: "ok", diot: "ok" });
    }
    // Under reduced motion the buttons are the only way to the four records: a real click reaches 남평화.
    await page.locator('[data-building-button="nampyeonghwa"]').click();
    // Off the stage the lens rests on the chosen building (with motion, the pointer would otherwise lead it).
    await page.mouse.move(4, 450, { steps: 2 });
    await expect(await readout(page, "float")).toHaveText(hero.lens.nampyeonghwa.place);
  });

  test("the 남평화 lens rests on its building without reaching into the text", async ({ page }) => {
    for (const [width, height] of [
      [1280, 800],
      [1366, 768],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await openHero(page);
      await page.locator('[data-building-button="nampyeonghwa"]').focus();
      await page.waitForTimeout(900);
      const reach = await page.evaluate(() => {
        const lens = document.querySelector('[data-hero-lens="desktop"]')?.getBoundingClientRect();
        if (!lens) return ["no lens"];
        const centre = { x: lens.left + lens.width / 2, y: lens.top + lens.height / 2 };
        const radius = lens.width / 2;
        return [...document.querySelectorAll<HTMLElement>("[data-hero-copy] [data-readout-obstacle]")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const dx = Math.max(rect.left - centre.x, 0, centre.x - rect.right);
            const dy = Math.max(rect.top - centre.y, 0, centre.y - rect.bottom);
            return Math.hypot(dx, dy) < radius - 1;
          })
          .map((element) => String(element.className));
      });
      expect(reach, `${width}x${height}`).toEqual([]);
      await expect(await readout(page, "float")).toHaveText(hero.lens.nampyeonghwa.place);
    }
  });

  test("a readout swap never prints two records over each other", async ({ page }) => {
    await openHero(page);
    const overlaps = await page.evaluate(async () => {
      const items = [...document.querySelectorAll<HTMLElement>('[data-hero-readout="float"] .hero-readout-item')];
      document.querySelector<HTMLElement>('[data-building-button="diot"]')?.focus();
      const start = performance.now();
      let worst = 0;
      while (performance.now() - start < 900) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const shown = items.map((item) => Number(getComputedStyle(item).opacity)).sort((a, b) => b - a);
        worst = Math.max(worst, shown[1] ?? 0);
      }
      return worst;
    });
    // The second most visible record is never more than a trace while another shows.
    expect(overlaps).toBeLessThan(0.2);
  });

  test("hovering only moves the visible readout; a choice is what gets announced", async ({ page }) => {
    await openHero(page);
    const live = page.locator("[data-hero-readout-live]");
    await expect(live).toContainText(hero.lens.cheongpyeonghwa.place);
    await hoverRoof(page, "apm");
    await page.waitForTimeout(500);
    await expect(live).toContainText(hero.lens.cheongpyeonghwa.place);
    await page.locator('[data-building-button="diot"]').focus();
    await expect(live).toContainText(hero.lens.diot.place);
  });
});

test.describe("hero: mobile", () => {
  onlyIn("mobile");

  test("three H1 lines, the CTA above the fold, chips swap the readout, no pin", async ({ page }, testInfo) => {
    await openHero(page);
    const { height, lineHeight } = await page.locator("h1").evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(node).lineHeight),
    }));
    expect(Math.round(height / lineHeight)).toBe(3);
    const cta = await page.locator("[data-hero-ctas]").getByRole("link", { name: hero.ctaPrimary.label }).boundingBox();
    expect(cta && cta.y + cta.height).toBeLessThanOrEqual(844);

    await expect(page.locator('[data-hero-map-box="mobile"]')).toBeVisible();
    await expect(page.locator('[data-hero-map-box="desktop"]')).toBeHidden();
    await expect(page.getByRole("radiogroup", { name: hero.chipsLabel })).toBeVisible();
    await expect(page.locator('[data-building-chip="cheongpyeonghwa"]')).toHaveAttribute("aria-checked", "true");
    await expect(await readout(page, "dock")).toHaveText(hero.lens.cheongpyeonghwa.place);

    await page.locator('[data-building-chip="apm"]').tap();
    await expect(page.locator('[data-building-chip="apm"]')).toHaveAttribute("aria-checked", "true");
    await expect(await readout(page, "dock")).toHaveText(hero.lens.apm.place);
    await page.locator('[data-building-chip="diot"]').tap();
    await expect(await readout(page, "dock")).toHaveText(hero.lens.diot.place);
    // 디오트 lies east of the phone view: the map pans so the lens sits on 디오트, not on 청평화.
    await page.waitForTimeout(800);
    const framed = await page.evaluate(() => {
      const box = document.querySelector('[data-hero-map-box="mobile"]');
      const lens = box?.querySelector(".hero-lens")?.getBoundingClientRect();
      const label = box?.querySelector('[data-building-label="diot"]')?.getBoundingClientRect();
      const frame = document.querySelector("[data-hero-frame]")?.getBoundingClientRect();
      if (!lens || !label || !frame) return null;
      const centre = { x: lens.left + lens.width / 2, y: lens.top + lens.height / 2 };
      // The label sits 12px above the roof the lens is centred on.
      const roof = { x: label.left + label.width / 2, y: label.bottom + 12 };
      return {
        onRoof: Math.hypot(centre.x - roof.x, centre.y - roof.y) < 8,
        inFrame: label.left >= frame.left && label.right <= frame.right,
      };
    });
    expect(framed).toEqual({ onRoof: true, inFrame: true });

    expect(await page.locator(".pin-spacer [data-hero-pin]").count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Let the 700ms lens glide and readout swap land before the review shot.
    await page.waitForTimeout(800);
    await shot(page, testInfo, "hero-mobile");
  });

  test("a pan never leaves a label cut at the frame's edge or showing through the nav pill", async ({ page }, testInfo) => {
    await openHero(page);
    for (const id of ["apm", "nampyeonghwa", "diot", "cheongpyeonghwa"] as const) {
      await page.locator(`[data-building-chip="${id}"]`).tap();
      await page.waitForTimeout(1100);
      const cut = await page.evaluate(() => {
        const frame = document.querySelector("[data-hero-viewport]")?.getBoundingClientRect();
        const pill = document.querySelector(".au-nav-pill")?.getBoundingClientRect();
        if (!frame) return ["no frame"];
        const top = Math.max(frame.top, pill?.bottom ?? 0);
        return [...document.querySelectorAll<HTMLElement>('[data-hero-map-box="mobile"] :is([data-building-label], [data-hero-uncle])')]
          .filter((element) => Number(getComputedStyle(element).opacity) > 0.05)
          .filter((element) => {
            const text = element.matches("[data-hero-uncle]") ? element.querySelector(".hero-uncle-name") : element;
            if (!text) return false;
            const range = document.createRange();
            range.selectNodeContents(text);
            const rect = range.getBoundingClientRect();
            const inside = rect.right > frame.left && rect.left < frame.right && rect.bottom > frame.top && rect.top < frame.bottom;
            const whole = rect.left >= frame.left - 0.5 && rect.right <= frame.right + 0.5 && rect.top >= top - 0.5 && rect.bottom <= frame.bottom + 0.5;
            return inside && !whole;
          })
          .map((element) => element.dataset.buildingLabel ?? "uncle");
      });
      expect(cut, `cut labels after the ${id} chip`).toEqual([]);
      await shot(page, testInfo, `hero-mobile-chip-${id}`);
    }
  });
});

test.describe("hero: reduced motion", () => {
  onlyIn("reduced-motion");

  test("static layout: no pin, no draw-in, buttons move a static lens", async ({ page }, testInfo) => {
    await openHero(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains("js-draw"))).toBe(false);
    expect(await page.locator(".pin-spacer [data-hero-pin]").count()).toBe(0);
    expect(await page.locator('[data-hero-lens="desktop"]').evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0.99);
    await expect(await readout(page, "float")).toHaveText(hero.lens.cheongpyeonghwa.place);

    // No lens follow: hovering does not change the readout.
    await hoverRoof(page, "apm");
    await page.waitForTimeout(400);
    await expect(await readout(page, "float")).toHaveText(hero.lens.cheongpyeonghwa.place);

    await page.locator('[data-building-button="diot"]').click();
    await expect(await readout(page, "float")).toHaveText(hero.lens.diot.place);
    // At 1440 the rail shows r2005 and r2031 itself; the hero's proxies stay hidden.
    await expect(page.locator('[data-rail-proxy="r2005"]')).toBeHidden();
    await shot(page, testInfo, "hero-reduced");
  });
});
