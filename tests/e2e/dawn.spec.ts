import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectBeat, openPage, settle } from "./chrome-helpers";

/**
 * S5 dawn (WP-14): the page's one theme switch at 05:53.
 *
 * desktop: the phase flips to day at 62% of the pin and back when scrolling
 *   up; the plate shows 전달 2 from 30%; the plate's pixels do not change
 *   across the flip; the WebGL loop draws only while the pin's progress
 *   changes; with WebGL disabled the CSS gradient carries the sky and nothing
 *   throws. Layout: the confirm card is opaque at pin start, never covers the
 *   copy or the route on short laptops, the stage stays clear of the record
 *   rail on wide screens, the pin never shifts layout, the slot row is no tab
 *   stop, and text on the sky holds AA at 56%, 62% (the switch) and 66%
 *   (the body line by line).
 * mobile: no pin and no WebGL context; the phase flips at the band middle,
 *   where the dot (holding the centre line) inks at the 05:53 stamp; the
 *   route follows the measured band; the slot row's focus ring is inset.
 * reduced-motion: two static bands, beats per band; clear of the rail.
 *
 * Dawn hooks: [data-dawn-scene] (pinned on desktop), [data-dawn-sky]
 * [data-sky=webgl|css][data-sky-state=running|idle][data-sky-frames],
 * [data-dawn-ramp] (CSS gradient), [data-dawn-band=night|day].
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

/** Scroll the desktop dawn pin to `progress` (0..1) and wait for scroll to rest. */
async function toPin(page: Page, progress: number): Promise<void> {
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-section="dawn"]')?.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>("[data-dawn-scene]")?.parentElement?.classList.contains("pin-spacer") === true,
    undefined,
    { timeout: 15_000 },
  );
  const top = await page.evaluate((p) => {
    const scene = document.querySelector<HTMLElement>("[data-dawn-scene]");
    const spacer = scene?.parentElement;
    if (!spacer?.classList.contains("pin-spacer")) throw new Error("the dawn scene is not pinned");
    const start = spacer.getBoundingClientRect().top + window.scrollY;
    return Math.round(start + p * (spacer.offsetHeight - window.innerHeight));
  }, progress);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await settle(page);
}

/** Put the viewport's centre line `offset` px below the top of `target` (an element inside the page). */
async function centreOn(page: Page, target: Locator, offset: number): Promise<void> {
  const top = await target.evaluate((element, px) => {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.top + window.scrollY + px - window.innerHeight / 2);
  }, offset);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
  await settle(page);
}

type Box = { left: number; top: number; right: number; bottom: number };

/** Viewport rect of the first match. */
async function box(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
}

/** Wait until the scrubbed timeline has caught up with the scroll (the sky loop idles; the CSS path just waits). */
async function restInPin(page: Page): Promise<void> {
  await page.waitForTimeout(1300);
  await page.waitForFunction(
    () => {
      const sky = document.querySelector<HTMLElement>("[data-dawn-sky]");
      return !sky || sky.dataset.sky !== "webgl" || sky.dataset.skyState === "idle";
    },
    undefined,
    { timeout: 15_000 },
  );
}

type SkyText = { label: string; ratio: number; large: boolean };

/**
 * Contrast of every text on the sky against the sky behind it: the text's
 * colour is read, then the dawn's text is made transparent and the pixels
 * under each text box are sampled (5th percentile, so dither and antialiased
 * edges do not decide). Ruler labels count only inside the window's unmasked
 * part. Transitions must be off (the caller adds the style).
 */
async function skyContrast(page: Page): Promise<SkyText[]> {
  const items = await page.evaluate(() => {
    const selectors = [".dawn-title", ".dawn-body", ".dawn-route-origin", ".dawn-demo", ".dawn-ruler-item", ".dawn-tick-label", ".dawn-mark-label", ".dawn-slot-next .dawn-slot-meta", ".dawn-slot-next .dawn-slot-value"];
    const out: { label: string; color: string; rect: [number, number, number, number]; large: boolean }[] = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(`#dawn ${selector}`)) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
        let opacity = 1;
        for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        if (opacity < 0.5) continue;
        let left = rect.left;
        let right = rect.right;
        const ruler = element.closest<HTMLElement>("[data-dawn-window]");
        if (ruler) {
          const windowRect = ruler.getBoundingClientRect();
          left = Math.max(left, windowRect.left + 72);
          right = Math.min(right, windowRect.right - 24);
          if (right - left < 4) continue;
        }
        // A paragraph that takes the light line by line is checked per line (its first line in its ::first-line ink).
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight) || rect.height;
        const lines = element.hasAttribute("data-dawn-lit-first") ? Math.max(1, Math.round(rect.height / lineHeight)) : 1;
        const rowHeight = rect.height / lines;
        for (let line = 0; line < lines; line += 1) {
          out.push({
            label: `${selector} ${lines > 1 ? `line ${line + 1} ` : ""}${element.textContent?.trim().slice(0, 12)}`,
            color: lines > 1 && line === 0 ? getComputedStyle(element, "::first-line").color : style.color,
            rect: [Math.round(left), Math.round(rect.top + line * rowHeight), Math.round(right), Math.round(rect.top + (line + 1) * rowHeight)],
            large: selector === ".dawn-title",
          });
        }
      }
    }
    return out;
  });
  const hide = await page.addStyleTag({
    content: "#dawn *, #dawn *::before, #dawn *::after, #dawn *::first-line { color: transparent !important; } #dawn .dawn-slot-next { border-color: transparent !important; } [data-chrome-root] { visibility: hidden !important; }",
  });
  const shot = await page.screenshot({ timeout: 60_000 });
  await hide.evaluate((element) => element.parentNode?.removeChild(element));
  return page.evaluate(
    async ({ base64, texts }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context");
      context.drawImage(image, 0, 0);
      const scale = image.width / window.innerWidth;
      const linear = (value: number) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      return texts.map(({ label, color, rect, large }) => {
        const [r, g, b] = (color.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
        const text = luminance(r, g, b);
        const [x0, y0, x1, y1] = rect.map((value) => Math.round(value * scale));
        const data = context.getImageData(Math.max(0, x0), Math.max(0, y0), Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
        const ratios: number[] = [];
        for (let i = 0; i < data.length; i += 16) {
          const sky = luminance(data[i], data[i + 1], data[i + 2]);
          ratios.push((Math.max(text, sky) + 0.05) / (Math.min(text, sky) + 0.05));
        }
        ratios.sort((a, c) => a - c);
        return { label, ratio: ratios[Math.floor(ratios.length * 0.05)] ?? 0, large };
      });
    },
    { base64: shot.toString("base64"), texts: items },
  );
}

/** Number of pixels that differ between two PNG screenshots of the same size (decoded in the page). */
async function differingPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const decode = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no 2d context");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const [x, y] = await Promise.all([decode(first), decode(second)]);
      if (x.width !== y.width || x.height !== y.height) return Number.POSITIVE_INFINITY;
      let count = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2]) count += 1;
      }
      return count;
    },
    [a.toString("base64"), b.toString("base64")] as const,
  );
}

/**
 * The plate inside its rounded corners: a vertical and a horizontal strip
 * (the 24px corner squares hold only padding over the sky). Digits and the
 * clock are masked; the spec allows changed digits.
 */
async function plateStrips(page: Page): Promise<Buffer[]> {
  const plate = page.locator('[data-record-column] [data-plate="full"]').first();
  await expect(plate).toBeVisible();
  const box = await plate.boundingBox();
  if (!box) throw new Error("the record plate has no box");
  const radius = 24;
  const x = Math.ceil(box.x);
  const y = Math.ceil(box.y);
  const width = Math.floor(box.x + box.width) - x;
  const height = Math.floor(box.y + box.height) - y;
  const mask = [page.locator("[data-plate] [data-digit-cell]"), page.locator("[data-plate] [data-plate-clock]")];
  const vertical = await page.screenshot({ clip: { x: x + radius, y, width: width - 2 * radius, height }, mask, animations: "disabled" });
  const horizontal = await page.screenshot({ clip: { x, y: y + radius, width, height: height - 2 * radius }, mask, animations: "disabled" });
  return [vertical, horizontal];
}

test.describe("dawn on desktop", () => {
  onlyIn("desktop");

  test("flips to day at 62% of the pin and back to night on the way up", async ({ page }) => {
    const errors = collectErrors(page);
    await openPage(page);

    await toPin(page, 0.2);
    await expectBeat(page, "b0307");

    await toPin(page, 0.32);
    await expectBeat(page, "b0553");
    await expect(page.locator("[data-plate-summary]").first()).toContainText("전달 2장");

    await toPin(page, 0.6);
    await expectBeat(page, "b0553");
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");

    await toPin(page, 0.64);
    await expectBeat(page, "b0553d");
    await expect(page.locator("html")).toHaveAttribute("data-phase", "day");

    await toPin(page, 0.6);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    await expectBeat(page, "b0553");

    await toPin(page, 0.25);
    await expectBeat(page, "b0307");
    await expect(page.locator("[data-plate-summary]").first()).toContainText("전달 0장");

    expect(errors).toEqual([]);
  });

  test("keeps the record plate's pixels across the theme switch", async ({ page }, testInfo) => {
    await openPage(page);

    await toPin(page, 0.6);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    await page.waitForTimeout(1200);
    const night = await plateStrips(page);
    await page.locator('[data-record-column] [data-plate="full"]').first().screenshot({ path: testInfo.outputPath("plate-060.png") });

    await toPin(page, 0.64);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "day");
    await page.waitForTimeout(1200);
    const day = await plateStrips(page);
    await page.locator('[data-record-column] [data-plate="full"]').first().screenshot({ path: testInfo.outputPath("plate-064.png") });

    for (const [index, strip] of night.entries()) {
      expect(await differingPixels(page, strip, day[index])).toBe(0);
    }
  });

  test("runs the WebGL loop only while the pin is active", async ({ page }, testInfo) => {
    await openPage(page);
    const sky = page.locator("[data-dawn-sky]");

    await toPin(page, 0.3);
    // The sky chunk loads lazily once the cart is near; allow a cold dev compile.
    await expect(sky).toHaveAttribute("data-sky", "webgl", { timeout: 30_000 });
    expect(await sky.getAttribute("data-sky-fallback")).toBeNull();
    await expect(page.locator("[data-dawn-sky] canvas")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("dawn-030.png") });

    // Parked inside the pin, the loop stops after a few unchanged frames.
    await expect(sky).toHaveAttribute("data-sky-state", "idle", { timeout: 10_000 });
    const parked = Number(await sky.getAttribute("data-sky-frames"));
    await page.waitForTimeout(600);
    await expect(sky).toHaveAttribute("data-sky-frames", String(parked));
    // Scrolling inside the pin draws again, then idles.
    await toPin(page, 0.45);
    await expect(sky).toHaveAttribute("data-sky-state", "idle", { timeout: 10_000 });
    expect(Number(await sky.getAttribute("data-sky-frames"))).toBeGreaterThan(parked);

    // Far below: the loop settles and stops; no frame is drawn off-screen.
    await page.locator("#signup").evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await settle(page);
    await expect(sky).toHaveAttribute("data-sky-state", "idle", { timeout: 5000 });
    const frames = await sky.getAttribute("data-sky-frames");
    await page.waitForTimeout(1000);
    await expect(sky).toHaveAttribute("data-sky-frames", frames ?? "");
    await expect(sky).toHaveAttribute("data-sky-state", "idle");

    // Above the section: still idle.
    await page.locator("#cart").evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await settle(page);
    await page.waitForTimeout(600);
    await expect(sky).toHaveAttribute("data-sky-state", "idle");
  });
});

test.describe("dawn layout on desktop", () => {
  onlyIn("desktop");

  test("opens the pin with the confirm card in place, and keeps the slot row out of the tab order", async ({ page }) => {
    await openPage(page);
    await toPin(page, 0);
    await restInPin(page);
    await expect(page.locator("[data-dawn-card]")).toHaveCSS("opacity", "1");
    // Desktop slots sit on the ruler track: nothing scrolls, so no tab stop.
    expect(await page.locator("[data-dawn-slots]").getAttribute("tabindex")).toBeNull();
  });

  for (const [width, height] of [
    [1366, 657],
    [1280, 690],
    [1280, 720],
    [1024, 700],
    [1024, 640],
  ] as const) {
    test(`keeps the card clear of the copy and the route at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openPage(page);
      for (const progress of [0, 0.25]) {
        await toPin(page, progress);
        await restInPin(page);
        const [body, card, route] = await Promise.all([box(page, ".dawn-body"), box(page, "[data-dawn-card]"), box(page, "[data-dawn-route]")]);
        expect(card.top - body.bottom, `copy to card at ${progress}`).toBeGreaterThanOrEqual(16);
        // At 0 the card still sits 24px low (it rises to 0.22).
        expect(route.top - card.bottom, `card to route at ${progress}`).toBeGreaterThanOrEqual(progress === 0 ? 12 : 16);
      }
    });
  }

  test("never shifts layout as the pin starts and ends, both ways", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const shifts: number[] = [];
      (window as Window & { __dawnShifts?: number[] }).__dawnShifts = shifts;
      new PerformanceObserver((list) => {
        const dawn = document.getElementById("dawn");
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
          if (entry.hadRecentInput || !dawn) continue;
          if ((entry.sources ?? []).some((source) => source.node && dawn.contains(source.node))) shifts.push(entry.value);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openPage(page);
    await page.locator("#cart").evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await settle(page);
    await page.mouse.move(700, 450);
    const pinEnd = await page.evaluate(() => {
      const spacer = document.querySelector<HTMLElement>("[data-dawn-scene]")?.parentElement;
      if (!spacer) throw new Error("no pin");
      return spacer.getBoundingClientRect().bottom + window.scrollY;
    });
    for (let step = 0; step < 120; step += 1) {
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
      if (await page.evaluate((end) => window.scrollY > end, pinEnd)) break;
    }
    await settle(page);
    for (let step = 0; step < 120; step += 1) {
      await page.mouse.wheel(0, -80);
      await page.waitForTimeout(40);
      if (await page.evaluate(() => (document.getElementById("cart")?.getBoundingClientRect().top ?? 0) > 0)) break;
    }
    await settle(page);
    const shifts = await page.evaluate(() => (window as Window & { __dawnShifts?: number[] }).__dawnShifts ?? []);
    expect(shifts.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.01);
  });

  test("keeps text on the sky at AA at 56%, at the 62% switch and at 66%", async ({ page }, testInfo) => {
    await openPage(page);
    await page.addStyleTag({ content: "#dawn *, #dawn *::before, #dawn *::after { transition: none !important; }" });
    for (const progress of [0.56, 0.62, 0.66]) {
      await toPin(page, progress);
      await restInPin(page);
      const texts = await skyContrast(page);
      expect(texts.length).toBeGreaterThan(10);
      for (const text of texts) expect(text.ratio, `${text.label} at ${progress}`).toBeGreaterThanOrEqual(text.large ? 3 : 4.5);
    }
    await page.screenshot({ path: testInfo.outputPath("dawn-066.png") });
  });
});

test.describe("dawn beside the record rail", () => {
  for (const [width, height] of [
    [1536, 864],
    [1920, 1080],
  ] as const) {
    test(`ends the stage clear of the rail at ${width}x${height}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === "mobile", "desktop widths only");
      await page.setViewportSize({ width, height });
      await openPage(page);
      if (testInfo.project.name === "desktop") {
        await toPin(page, 0.5);
        await restInPin(page);
      } else {
        await centreOn(page, page.locator('[data-dawn-band="day"]'), 200);
      }
      const rail = await box(page, "[data-record-column]");
      for (const selector of [".dawn-dest-card", ".dawn-route-node", "[data-dawn-window]", ".dawn-slot-next"]) {
        expect((await box(page, selector)).right + 24, selector).toBeLessThanOrEqual(rail.left);
      }
    });
  }
});

test.describe("dawn when the WebGL context is lost", () => {
  onlyIn("desktop");

  test("removes the canvas and keeps the CSS gradient", async ({ page }) => {
    const errors = collectErrors(page);
    await openPage(page);
    await toPin(page, 0.4);
    const sky = page.locator("[data-dawn-sky]");
    await expect(sky).toHaveAttribute("data-sky", "webgl", { timeout: 30_000 });

    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-dawn-sky] canvas");
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    });

    await expect(sky).toHaveAttribute("data-sky", "css");
    await expect(sky).toHaveAttribute("data-sky-fallback", "lost");
    await expect(page.locator("[data-dawn-sky] canvas")).toHaveCount(0);
    await expect(page.locator("[data-dawn-ramp]")).toHaveCSS("visibility", "visible");

    // The pin keeps working on the gradient.
    await toPin(page, 0.64);
    await expectBeat(page, "b0553d");
    expect(errors).toEqual([]);
  });
});

test.describe("dawn without WebGL", () => {
  onlyIn("desktop");

  test("keeps the CSS gradient sky and throws nothing", async ({ playwright, baseURL }, testInfo) => {
    // launchOptions cannot change per describe; this test runs its own browser.
    const browser = await playwright.chromium.launch({ args: ["--disable-webgl", "--disable-webgl2"] });
    try {
      const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
      const page = await context.newPage();
      const errors = collectErrors(page);
      await openPage(page);

      await toPin(page, 0.3);
      const sky = page.locator("[data-dawn-sky]");
      await expect(sky).toHaveAttribute("data-sky", "css");
      await expect(page.locator("[data-dawn-sky] canvas")).toHaveCount(0);
      const ramp = page.locator("[data-dawn-ramp]");
      await expect(ramp).toHaveCSS("visibility", "visible");
      expect(await ramp.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("linear-gradient");
      await page.waitForTimeout(1200);
      const before = await ramp.evaluate((element) => getComputedStyle(element).transform);

      await toPin(page, 0.64);
      await expectBeat(page, "b0553d");
      await page.waitForTimeout(1200);
      await page.screenshot({ path: testInfo.outputPath("dawn-css-064.png") });

      // The gradient rose with the pin: one transform, a new position.
      const after = await ramp.evaluate((element) => getComputedStyle(element).transform);
      expect(after).not.toBe(before);

      expect(errors).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }
  });
});

test.describe("dawn on mobile", () => {
  onlyIn("mobile");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      (window as Window & { __webglContexts?: number }).__webglContexts = 0;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
          (window as Window & { __webglContexts?: number }).__webglContexts! += 1;
        }
        return (original as (this: HTMLCanvasElement, ...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  });

  test("has no pin and no WebGL, and flips the phase at the band middle", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPage(page);
    const scene = page.locator("[data-dawn-scene]");
    expect(await scene.evaluate((element) => element.parentElement?.classList.contains("pin-spacer") ?? false)).toBe(false);

    const height = await scene.evaluate((element) => element.getBoundingClientRect().height);
    const viewport = page.viewportSize();
    expect(height).toBeGreaterThanOrEqual((viewport?.height ?? 844) * 1.55);

    // The card block centres: 05:53 is recorded, still night.
    const card = page.locator("[data-dawn-card]");
    const cardMiddle = await card.evaluate((element) => element.getBoundingClientRect().height / 2);
    await centreOn(page, card, cardMiddle + 8);
    await expectBeat(page, "b0553");

    // Just above and just below the band middle.
    await centreOn(page, scene, height / 2 - 24);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");
    await centreOn(page, scene, height / 2 + 24);
    await expectBeat(page, "b0553d");
    await page.screenshot({ path: testInfo.outputPath("dawn-mobile-middle.png") });

    // And back.
    await centreOn(page, scene, height / 2 - 24);
    await expect(page.locator("html")).toHaveAttribute("data-phase", "night");

    // The route follows the measured band and ends at the destination card's middle.
    const band = await scene.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      measured: Number.parseFloat(getComputedStyle(element).getPropertyValue("--dawn-band-h")),
    }));
    expect(Math.abs(band.measured - band.height)).toBeLessThanOrEqual(1);
    const [node, dest] = await Promise.all([box(page, ".dawn-route-node"), box(page, ".dawn-dest-card")]);
    expect(Math.abs((node.top + node.bottom) / 2 - (dest.top + dest.bottom) / 2)).toBeLessThanOrEqual(2);

    // The dot holds the viewport's centre line (the record pill's scroll-padding
    // must not shrink the view timeline), the 05:53 stamp marks the band middle,
    // and the dot inks there, with the phase flip.
    if (await page.evaluate(() => CSS.supports("animation-timeline: view()"))) {
      const centre = (viewport?.height ?? 844) / 2;
      const ink = () => page.locator(".dawn-dot").evaluate((element) => Number(getComputedStyle(element, "::before").opacity));
      await centreOn(page, scene, height / 2);
      const [dot, stamp] = await Promise.all([box(page, ".dawn-dot"), box(page, ".dawn-route-stamp")]);
      expect(Math.abs((dot.top + dot.bottom) / 2 - centre)).toBeLessThanOrEqual(3);
      expect(Math.abs((stamp.top + stamp.bottom) / 2 - centre)).toBeLessThanOrEqual(3);
      await centreOn(page, scene, height / 2 - 40);
      expect(await ink()).toBe(0);
      await centreOn(page, scene, height / 2 + 40);
      expect(await ink()).toBe(1);
    }

    // Through the whole band and past it: never a WebGL context.
    await page.locator("#receipt").evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
    await settle(page);
    await expect(page.locator("[data-dawn-sky] canvas")).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { __webglContexts?: number }).__webglContexts ?? 0)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("dawn on a landscape phone", () => {
  onlyIn("mobile");

  test("follows the band when its content makes it taller than 160vh", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openPage(page);
    const scene = page.locator("[data-dawn-scene]");
    await scene.scrollIntoViewIfNeeded();
    await settle(page);
    await expect
      .poll(() =>
        scene.evaluate((element) => {
          const height = element.getBoundingClientRect().height;
          const measured = Number.parseFloat(getComputedStyle(element).getPropertyValue("--dawn-band-h"));
          return Math.abs(measured - height);
        }),
      )
      .toBeLessThanOrEqual(1);
    const height = await scene.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(390 * 1.6 + 1);
    const [node, dest] = await Promise.all([box(page, ".dawn-route-node"), box(page, ".dawn-dest-card")]);
    expect(Math.abs((node.top + node.bottom) / 2 - (dest.top + dest.bottom) / 2)).toBeLessThanOrEqual(2);
  });
});

test.describe("dawn slot row on phones", () => {
  onlyIn("mobile");

  test("is a tab stop only while it scrolls, with an inset day ring", async ({ page }) => {
    await openPage(page);
    const slots = page.locator("[data-dawn-slots]");
    await centreOn(page, slots, 40);
    await expect
      .poll(() =>
        slots.evaluate((element) => {
          const scrolls = element.scrollWidth > element.clientWidth + 1;
          return `${scrolls}:${element.getAttribute("tabindex") ?? ""}`;
        }),
      )
      .toMatch(/^(false:|true:0)$/);
    const scrolls = await slots.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(await slots.getAttribute("tabindex")).toBe(scrolls ? "0" : null);
    if (!scrolls) return;
    await slots.focus();
    const ring = await slots.evaluate((element) => {
      const style = getComputedStyle(element);
      return { visible: element.matches(":focus-visible"), offset: style.outlineOffset, color: style.outlineColor };
    });
    if (ring.visible) {
      expect(ring.offset).toBe("-2px");
      expect(ring.color).toBe("rgb(12, 72, 62)");
    }
  });
});

test.describe("dawn with reduced motion", () => {
  onlyIn("reduced-motion");

  test("renders two static bands and reports a beat per band", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openPage(page);
    const scene = page.locator("[data-dawn-scene]");
    expect(await scene.evaluate((element) => element.parentElement?.classList.contains("pin-spacer") ?? false)).toBe(false);
    await expect(page.locator("[data-dawn-sky]")).toBeHidden();

    const night = page.locator('[data-dawn-band="night"]');
    const day = page.locator('[data-dawn-band="day"]');
    await expect(night).toHaveCSS("background-color", "rgb(7, 35, 28)");
    await expect(day).toHaveCSS("background-color", "rgb(237, 236, 227)");
    const rule = page.locator(".dawn-horizon");
    await expect(rule).toBeVisible();
    expect(await rule.evaluate((element) => element.getBoundingClientRect().height)).toBe(1);

    // Every string is there, at rest.
    await expect(page.locator("[data-dawn-card]")).toHaveCSS("opacity", "1");
    await expect(page.getByRole("group", { name: "전달 확인 예시" })).toContainText("물품을 전달했나요?");
    await expect(day).toContainText("망원 셀렉트샵");
    await expect(day).toContainText("1차 · 05:53");
    await expect(day).toContainText("남은 미송 4장");

    const nightHeight = await night.evaluate((element) => element.getBoundingClientRect().height);
    await centreOn(page, night, nightHeight / 2);
    await expectBeat(page, "b0553");

    const dayHeight = await day.evaluate((element) => element.getBoundingClientRect().height);
    await centreOn(page, day, dayHeight / 2);
    await expectBeat(page, "b0553d");
    await page.screenshot({ path: testInfo.outputPath("dawn-reduced-day.png") });

    await centreOn(page, night, nightHeight / 2);
    await expectBeat(page, "b0553");

    await expect(page.locator("[data-dawn-sky] canvas")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
