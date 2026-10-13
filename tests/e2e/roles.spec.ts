import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import sharp from "sharp";

import { OUTLINE_BOXES, type OutlineBox, type OutlineSide } from "../../src/components/sections/roles/outline-boxes";
import { roles } from "../../src/content/copy";
import { APP_CLIPS } from "../../src/content/media";
import type { SectionId } from "../../src/content/story";
import { expectBeat, jumpTo, openPage, settle } from "./chrome-helpers";

/**
 * S7 roles (WP-16, spec S7): two real 09:41 home screens split by a draggable
 * seam on desktop and a radiogroup toggle below 1024px, with real footage on
 * demand and an outline on the same denim card in both homes.
 *
 * Projects: desktop (Chromium 1440x900), mobile (WebKit 390x844, touch) and
 * reduced-motion (Chromium 1440x900). Screenshots of the section land in the
 * test output folder for review.
 */

const NIGHT_TO_RECEIPT: readonly SectionId[] = ["hero", "words", "route", "cart", "dawn", "receipt"];
const SIDES: readonly OutlineSide[] = ["retailer", "uncle"];
const PLAY = { retailer: roles.retailer.play, uncle: roles.uncle.play } as const;

function isDesktop(testInfo: TestInfo): boolean {
  return testInfo.project.name !== "mobile";
}

function isReduced(testInfo: TestInfo): boolean {
  return testInfo.project.name === "reduced-motion";
}

const section = (page: Page) => page.locator("#roles");
const stage = (page: Page) => page.locator("[data-roles-seam]");
const side = (page: Page, id: OutlineSide) => page.locator(`[data-side="${id}"]`);
const slider = (page: Page) => page.getByRole("slider", { name: roles.seam.label });
const media = (page: Page, id: OutlineSide) =>
  page.locator(`.device-media[data-clip="${id === "retailer" ? APP_CLIPS.retailerDenimDetail.id : APP_CLIPS.uncleHome.id}"]`);

/** Instantly scroll so a card's outline has its bottom edge at `at` (0 to 1) of the viewport height. */
async function putCardBottomAt(page: Page, id: OutlineSide, at: number): Promise<void> {
  await page.evaluate(
    ({ card, share }) => {
      const path = document.querySelector<SVGPathElement>(`[data-roles-outline="${card}"]`);
      if (!path) throw new Error("no roles outline");
      const rect = path.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + rect.bottom - window.innerHeight * share, behavior: "instant" });
    },
    { card: id, share: at },
  );
}

/** Instantly scroll so the stage starts 1.4 viewports below the top: near enough to load, out of view. */
async function armBelowFold(page: Page): Promise<void> {
  await page.evaluate(() => {
    const stageTop = document.querySelector<HTMLElement>("[data-roles-seam]")?.getBoundingClientRect().top;
    if (stageTop === undefined) throw new Error("no roles stage");
    window.scrollTo({ top: window.scrollY + stageTop - window.innerHeight * 1.4, behavior: "instant" });
  });
}

/**
 * The visible outlines and the connector are fully drawn: DrawSVG has handed
 * them back (no inline dash, no inline fill-opacity), or never touched them.
 */
async function outlinesDrawn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const outlines = Array.from(document.querySelectorAll<SVGPathElement>("[data-roles-outline]")).filter((path) => {
      const owner = path.closest<HTMLElement>(".roles-side");
      return owner !== null && getComputedStyle(owner).visibility !== "hidden";
    });
    const mask = document.querySelector<SVGPathElement>(".roles-connector-mask");
    return [...outlines, ...(mask ? [mask] : [])].every((path) => path.style.strokeDasharray === "" && path.style.fillOpacity === "");
  });
}

/** Desktop motion: wait until the lazily loaded drag plugins (and DrawSVG) have arrived. */
async function waitForSeamPlugins(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches ||
      document.querySelector("[data-roles-track][data-roles-drag]") !== null,
    undefined,
    { timeout: 30_000 },
  );
}

/** Bring both cards into view (the lower card's bottom at 80%) and wait for the entry draw to finish. */
async function showStage(page: Page): Promise<void> {
  await putCardBottomAt(page, "uncle", 0.8);
  await settle(page);
  // Desktop motion: the drag plugins (and the outlines' entry draw) arrive once the stage is near.
  await waitForSeamPlugins(page);
  await expect.poll(() => outlinesDrawn(page)).toBe(true);
}

/** Computed opacity of each side's outline overlay, and of the desktop connector. */
async function overlays(page: Page): Promise<{ retailer: string; uncle: string; connector: string }> {
  return page.evaluate(() => {
    const opacity = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el).opacity : "missing";
    };
    return {
      retailer: opacity('[data-side="retailer"] .roles-outline'),
      uncle: opacity('[data-side="uncle"] .roles-outline'),
      connector: opacity(".roles-connector"),
    };
  });
}

async function seamValue(page: Page): Promise<number> {
  return stage(page).evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--seam")));
}

async function playing(page: Page): Promise<string[]> {
  return page.locator("video").evaluateAll((videos) =>
    (videos as HTMLVideoElement[]).filter((video) => !video.paused).map((video) => video.closest(".device-media")?.getAttribute("data-clip") ?? "?"),
  );
}

/** Rect of an element in CSS px relative to the viewport. */
async function rectOf(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/**
 * Find the card edges in a screenshot of the bare screen (outline hidden): near
 * each expected edge, the transition from a pixel darker than the midpoint
 * between the app canvas (#EDECE3) and the card (#F5F4EE) to a brighter one,
 * closest to the expected position. Neighbouring cards sit only 8-18px away,
 * so the search looks for the transition, not the first bright pixel.
 */
async function cardEdges(png: Buffer, width: number, height: number, box: OutlineBox) {
  const { data, info } = await sharp(png).resize(Math.round(width), Math.round(height), { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = (x: number, y: number) => {
    const i = (Math.round(y) * info.width + Math.round(x)) * 3;
    return (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
  };
  const threshold = (237 + 236 + 227 + 245 + 244 + 238) / 2;
  const expected = {
    left: (box.x / 100) * info.width,
    right: ((box.x + box.w) / 100) * info.width,
    top: (box.y / 100) * info.height,
    bottom: ((box.y + box.h) / 100) * info.height,
  };
  const midY = ((box.y + box.h / 2) / 100) * info.height;
  const midX = info.width / 2;
  const limit = { x: info.width - 1, y: info.height - 1 };
  /** inward: +1 when the card lies at higher coordinates (left, top edges), -1 otherwise. */
  const edge = (target: number, inward: 1 | -1, max: number, at: (t: number) => number) => {
    let best = Number.NaN;
    for (let t = Math.max(1, Math.round(target - 6)); t <= Math.min(max - 1, Math.round(target + 6)); t += 1) {
      if (at(t) < threshold || at(t - inward) >= threshold) continue;
      const position = inward === 1 ? t : t + 1;
      if (Number.isNaN(best) || Math.abs(position - target) < Math.abs(best - target)) best = position;
    }
    return best;
  };
  return {
    expected,
    found: {
      left: edge(expected.left, 1, limit.x, (x) => lum(x, midY)),
      right: edge(expected.right, -1, limit.x, (x) => lum(x, midY)),
      top: edge(expected.top, 1, limit.y, (y) => lum(midX, y)),
      bottom: edge(expected.bottom, -1, limit.y, (y) => lum(midX, y)),
    },
  };
}

test.describe("S7 roles", () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page);
  });

  test("renders every string of the section and the real 09:41 stills", async ({ page }, testInfo) => {
    const root = section(page);
    await expect(root.getByRole("heading", { level: 2 })).toHaveText(roles.h2.join(" "));
    await expect(root).toContainText(roles.body);
    for (const id of SIDES) {
      const copy = roles[id];
      if (isDesktop(testInfo) || id === "retailer") {
        // Each role is a heading under the H2 (the hidden mobile side drops out of the tree).
        await expect(side(page, id).getByRole("heading", { level: 3, name: copy.role })).toBeAttached();
      }
      await expect(side(page, id)).toContainText(copy.role);
      await expect(side(page, id)).toContainText(copy.line);
      await expect(side(page, id).locator("figcaption")).toHaveText(copy.caption);
    }
    // The body breaks by meaning: each quoted app label, whose home it is and the closing sentence stay whole.
    for (const label of ["‘다음 미송 재확인’으로,", "‘상대방 확인 대기’로", "소매업자 홈에는", "사입삼촌 홈에는", "기록은 하나, 할 일은 각자예요."]) {
      await expect(root.locator(".roles-copy p span.whitespace-nowrap", { hasText: label })).toHaveCount(1);
    }
    await expect(root).toContainText(roles.mediaCaption);
    await expect(root).toContainText(roles.footnote);
    await expect(side(page, "retailer").locator("img")).toHaveAttribute("src", /\/media\/app\/retailer-home-0941-1080\.webp$/);
    await expect(side(page, "uncle").locator("img")).toHaveAttribute("src", /\/media\/app\/uncle-home-0941-1080\.webp$/);
    await expect(side(page, "retailer").locator("video source").first()).toHaveAttribute("src", APP_CLIPS.retailerDenimDetail.webm);
    await expect(side(page, "uncle").locator("video source").first()).toHaveAttribute("src", APP_CLIPS.uncleHome.webm);
  });

  test("no phone media appears before 09:41 (S1-S6)", async ({ page }) => {
    for (const id of NIGHT_TO_RECEIPT) {
      const night = page.locator(`[data-section="${id}"]`);
      await expect(night.locator("video")).toHaveCount(0);
      await expect(night.locator('img[src*="/media/app/"], source[srcset*="/media/app/"], [data-device]')).toHaveCount(0);
    }
    // The first phone frame on the page is the retailer's, in this section.
    const firstDevice = await page.locator("[data-device]").first().evaluate((el) => el.closest("[data-section]")?.getAttribute("data-section"));
    expect(firstDevice).toBe("roles");
  });

  test("the seam's drag plugins load only once the stage is near (spec 13)", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo) || isReduced(testInfo), "Draggable exists only in desktop motion");
    const track = page.locator("[data-roles-track]");
    // At the hero, about ten viewports above the section, the seam has no drag yet.
    await page.waitForTimeout(1500);
    await expect(track).not.toHaveAttribute("data-roles-drag");
    // The keyboard slider already works at its static 50/50 split.
    await expect(slider(page)).toHaveAttribute("aria-valuenow", "50");
    await showStage(page);
    await expect(track).toHaveAttribute("data-roles-drag", "");
  });

  test("plugins that arrive with the stage on screen leave the drawn outlines and connector alone", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo) || isReduced(testInfo), "the entry draw exists only in desktop motion");
    // A slow connection: the Draggable and Inertia chunks arrive 2s after the stage is on screen.
    let delayed = 0;
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      if (/Draggable|InertiaPlugin/.test(body.toString("utf8"))) {
        delayed += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.fulfill({ response, body });
    });
    // Count every frame in which an outline or the connector mask carries a dash (hidden or mid-draw).
    await page.evaluate(() => {
      const w = window as unknown as { rolesDashedFrames: number };
      w.rolesDashedFrames = 0;
      const tick = () => {
        const paths = document.querySelectorAll<SVGPathElement>("[data-roles-outline], .roles-connector-mask");
        if (Array.from(paths).some((path) => path.style.strokeDasharray !== "" || path.style.fillOpacity !== "")) w.rolesDashedFrames += 1;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await putCardBottomAt(page, "uncle", 0.8);
    await waitForSeamPlugins(page);
    expect(delayed).toBeGreaterThan(0);
    // Long enough for a draw armed on arrival to have hidden the outlines and played most of the way.
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => (window as unknown as { rolesDashedFrames: number }).rolesDashedFrames)).toBe(0);
    expect(await outlinesDrawn(page)).toBe(true);
    expect((await overlays(page)).connector).toBe("1");
    await section(page).screenshot({ path: testInfo.outputPath("roles-slow-plugins.png") });
  });

  test("a landing with the cards in view plays the entry draw without another scroll", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo) || isReduced(testInfo), "the entry draw exists only in desktop motion");
    test.setTimeout(120_000);
    // As a nav jump: the plugins arrive while the stage is still below the fold, then the page lands.
    // Upper card fully in view with the lower one cut off (the nav jump at 1440x900 and 1280x800),
    // the upper card's bottom on the fold (the nav jump at 1280x720), and both cards in view (1920x1080).
    const landings: readonly { card: OutlineSide; at: number }[] = [
      { card: "retailer", at: 0.92 },
      { card: "retailer", at: 1 },
      { card: "uncle", at: 0.97 },
    ];
    for (const [index, landing] of landings.entries()) {
      if (index > 0) await openPage(page);
      await armBelowFold(page);
      await waitForSeamPlugins(page);
      // Armed: the outlines wait, hidden, below the fold.
      await expect.poll(() => outlinesDrawn(page)).toBe(false);
      await putCardBottomAt(page, landing.card, landing.at);
      await expect.poll(() => outlinesDrawn(page), { message: `${landing.card} bottom at ${landing.at}` }).toBe(true);
    }
    expect((await overlays(page)).connector).toBe("1");
  });

  test("below 1024px the showing device's own card starts the entry draw", async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), "the toggle exists below 1024px");
    test.setTimeout(120_000);
    const choose = (id: OutlineSide) =>
      // A click event, not check(): check() would scroll the toggle, and the cards with it, into view.
      page.getByRole("radio", { name: roles.toggle.options[SIDES.indexOf(id)] }).dispatchEvent("click");
    const cardBottom = (id: OutlineSide) => rectOf(side(page, id).locator(".roles-outline path")).then((r) => r.y + r.height);
    const viewport = page.viewportSize()?.height ?? 844;

    // The retailer showing: its card, higher on the screen than the uncle's, draws once it is in view.
    await armBelowFold(page);
    await expect.poll(() => outlinesDrawn(page)).toBe(false);
    await putCardBottomAt(page, "retailer", 0.92);
    expect(await cardBottom("uncle")).toBeGreaterThan(viewport);
    await expect.poll(() => outlinesDrawn(page), { message: "retailer card in view" }).toBe(true);

    // The uncle showing: the retailer's card in view does not draw the uncle's, still cut off ...
    await openPage(page);
    await armBelowFold(page);
    await expect.poll(() => outlinesDrawn(page)).toBe(false);
    await choose("uncle");
    await putCardBottomAt(page, "retailer", 0.85);
    expect(await cardBottom("uncle")).toBeGreaterThan(viewport);
    await page.waitForTimeout(1000);
    expect(await outlinesDrawn(page)).toBe(false);
    // ... a switch back to the retailer, its card in view, draws it as the crossfade lands ...
    await choose("retailer");
    await expect.poll(() => outlinesDrawn(page), { message: "switch to the retailer, its card in view" }).toBe(true);

    // ... and the uncle's card, once in view, draws itself.
    await openPage(page);
    await armBelowFold(page);
    await expect.poll(() => outlinesDrawn(page)).toBe(false);
    await choose("uncle");
    await putCardBottomAt(page, "uncle", 0.92);
    await expect.poll(() => outlinesDrawn(page), { message: "uncle card in view" }).toBe(true);
  });

  test("the record plate reads 09:41 while the roles section is active", async ({ page }) => {
    await jumpTo(page, "roles", { inset: 240 });
    await expectBeat(page, "b0941");
  });

  test("outlines land on the denim cards within 4px", async ({ page }, testInfo) => {
    if (!isDesktop(testInfo)) await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
    await showStage(page);
    await section(page).screenshot({ path: testInfo.outputPath(`roles-${testInfo.project.name}.png`) });

    for (const id of SIDES) {
      if (!isDesktop(testInfo) && id === "uncle") {
        await page.getByRole("radio", { name: roles.toggle.options[1] }).check();
        await expect(side(page, "uncle")).toHaveCSS("opacity", "1");
        await showStage(page);
      }
      const screen = side(page, id).locator(".device-screen");
      const outline = side(page, id).locator(".roles-outline path");
      const screenRect = await rectOf(screen);
      const outlineRect = await rectOf(outline);
      const box = OUTLINE_BOXES[id];
      // The drawn rect is the box on the screen (the stroke straddles the edge).
      expect(Math.abs(outlineRect.x - (screenRect.x + (screenRect.width * box.x) / 100))).toBeLessThanOrEqual(1.5);
      expect(Math.abs(outlineRect.y - (screenRect.y + (screenRect.height * box.y) / 100))).toBeLessThanOrEqual(1.5);
      expect(Math.abs(outlineRect.width - (screenRect.width * box.w) / 100)).toBeLessThanOrEqual(2);
      expect(Math.abs(outlineRect.height - (screenRect.height * box.h) / 100)).toBeLessThanOrEqual(2);

      // And the box sits on the card in the real pixels: hide the outline, find the card edges.
      await side(page, id).locator(".roles-outline").evaluate((el) => ((el as SVGElement).style.visibility = "hidden"));
      const png = await screen.screenshot({ scale: "css", animations: "disabled" });
      await side(page, id).locator(".roles-outline").evaluate((el) => ((el as SVGElement).style.visibility = ""));
      const { expected, found } = await cardEdges(png, screenRect.width, screenRect.height, box);
      for (const edge of ["left", "right", "top", "bottom"] as const) {
        expect(Number.isNaN(found[edge]), `${id} ${edge} edge found`).toBe(false);
        expect(Math.abs(found[edge] - expected[edge]), `${id} ${edge} edge`).toBeLessThanOrEqual(4);
      }
    }
  });

  test("the seam slider steps 5% per arrow and jumps to the bounds with Home and End", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the seam exists from 1024px");
    await showStage(page);
    const handle = slider(page);
    await expect(handle).toHaveAttribute("aria-valuenow", "50");
    await expect(handle).toHaveAttribute("aria-valuetext", "소매업자 화면 50퍼센트");
    await expect(handle).toHaveAttribute("aria-valuemin", "25");
    await expect(handle).toHaveAttribute("aria-valuemax", "75");
    await handle.focus();

    await page.keyboard.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "55");
    await expect(handle).toHaveAttribute("aria-valuetext", "소매업자 화면 55퍼센트");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.55, 3);

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "45");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.45, 3);

    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "25");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.25, 3);
    await page.keyboard.press("ArrowLeft");
    await expect(handle).toHaveAttribute("aria-valuenow", "25");

    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "75");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.75, 3);
    await page.keyboard.press("ArrowRight");
    await expect(handle).toHaveAttribute("aria-valuenow", "75");

    if (isReduced(testInfo)) {
      // Reduced motion: the slider jumps, no tween in between.
      await page.keyboard.press("Home");
      expect(await seamValue(page)).toBeCloseTo(0.25, 3);
    }
  });

  test("a click on the knob's chevrons or dot moves the seam without a drag (WCAG 2.5.7)", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the seam exists from 1024px");
    await showStage(page);
    const handle = slider(page);
    const clickAt = async (zone: "left" | "dot" | "right") => {
      const box = await rectOf(handle);
      const x = zone === "left" ? box.x + 10 : zone === "right" ? box.x + box.width - 10 : box.x + box.width / 2;
      await page.mouse.click(x, box.y + box.height / 2);
    };

    await clickAt("left");
    await expect(handle).toHaveAttribute("aria-valuenow", "25");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.25, 3);
    await clickAt("left");
    await expect(handle).toHaveAttribute("aria-valuenow", "25");

    await clickAt("right");
    await expect(handle).toHaveAttribute("aria-valuenow", "50");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.5, 3);
    await clickAt("right");
    await expect(handle).toHaveAttribute("aria-valuenow", "75");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.75, 3);

    await clickAt("dot");
    await expect(handle).toHaveAttribute("aria-valuenow", "50");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.5, 3);

    if (isReduced(testInfo)) {
      // No drag under reduced motion, so the seam line promises none: no grab cursor, no hit strip.
      const line = page.locator(".roles-seam-line");
      await expect(line).toHaveCSS("cursor", "default");
      await expect(line).toHaveCSS("pointer-events", "none");
      await expect(handle).toHaveCSS("cursor", "pointer");
    }
  });

  test("the seam clips each device at the seam and fades the narrower side's label", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the seam exists from 1024px");
    await showStage(page);
    await slider(page).focus();
    await page.keyboard.press("Home");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.25, 3);
    await page.waitForTimeout(150);

    const stageRect = await rectOf(stage(page));
    const seamX = stageRect.x + stageRect.width * 0.25;
    const handleRect = await rectOf(slider(page));
    expect(Math.abs(handleRect.x + handleRect.width / 2 - seamX)).toBeLessThanOrEqual(1);
    // The retailer column's visible right edge is the seam.
    expect(await side(page, "retailer").locator(".roles-col").evaluate((el) => getComputedStyle(el).clipPath)).toContain("inset(");
    const retailerVisibleRight = await side(page, "retailer")
      .locator(".roles-col")
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const match = /inset\(\S+ (-?[\d.]+)px/.exec(getComputedStyle(el).clipPath);
        return r.right - Number(match?.[1] ?? 0);
      });
    expect(Math.abs(retailerVisibleRight - seamX)).toBeLessThanOrEqual(1.5);
    // The narrower side's role and role line fade to 0.7 (still AA); its small grey home caption,
    // which would drop below 4.5:1, keeps full strength.
    const fade = (id: OutlineSide, part: string) =>
      side(page, id)
        .locator(`.roles-label-${part}`)
        .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await fade("retailer", "role")).toBeCloseTo(0.7, 2);
    expect(await fade("retailer", "line")).toBeCloseTo(0.7, 2);
    expect(await fade("retailer", "home")).toBe(1);
    expect(Number(await side(page, "retailer").locator(".roles-label").evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    expect(await fade("uncle", "role")).toBeCloseTo(1, 2);
    expect(await fade("uncle", "line")).toBeCloseTo(1, 2);
    await section(page).screenshot({ path: testInfo.outputPath(`roles-seam-25-${testInfo.project.name}.png`) });
  });

  test("a play on the narrower side brings the seam back to 50/50", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the seam exists from 1024px");
    await showStage(page);
    const press = async (key: string, at: number) => {
      await slider(page).focus();
      await page.keyboard.press(key);
      await expect.poll(() => seamValue(page)).toBeCloseTo(at, 3);
    };
    const play = async (id: OutlineSide) => {
      await side(page, id).getByRole("button", { name: PLAY[id] }).click();
      await expect(media(page, id)).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    };

    // A play on the side that is already wider keeps the reader's split.
    await press("End", 0.75);
    await play("retailer");
    await page.waitForTimeout(900);
    expect(await seamValue(page)).toBeCloseTo(0.75, 3);

    // The uncle's clip at the 75% bound would play cut at the seam and dimmed: the seam comes back.
    await play("uncle");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.5, 3);

    // And the retailer's at the 25% bound.
    await press("Home", 0.25);
    await play("retailer");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.5, 3);
    await expect(slider(page)).toHaveAttribute("aria-valuenow", "50");
    await expect(media(page, "retailer")).toHaveCSS("filter", /brightness\(1\)|none/);
    await section(page).screenshot({ path: testInfo.outputPath(`roles-play-snap-${testInfo.project.name}.png`) });
  });

  test("the connector joins the two outlines through the dot", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the connector exists from 1024px");
    await showStage(page);
    for (const key of ["", "Home", "End"]) {
      if (key) {
        await slider(page).focus();
        await page.keyboard.press(key);
        await page.waitForTimeout(isReduced(testInfo) ? 50 : 900);
      }
      const geometry = await page.evaluate(() => {
        const path = document.querySelector<SVGPathElement>("[data-roles-connector]");
        const svg = path?.ownerSVGElement;
        const handle = document.querySelector<HTMLElement>("[data-roles-handle]");
        const retailer = document.querySelector<SVGPathElement>('[data-roles-outline="retailer"]');
        const uncle = document.querySelector<SVGPathElement>('[data-roles-outline="uncle"]');
        const retailerCol = retailer?.closest<HTMLElement>(".roles-col");
        const uncleCol = uncle?.closest<HTMLElement>(".roles-col");
        if (!path || !svg || !handle || !retailer || !uncle || !retailerCol || !uncleCol) return null;
        const origin = svg.getBoundingClientRect();
        const toPage = (point: DOMPoint) => ({ x: origin.x + point.x, y: origin.y + point.y });
        const length = path.getTotalLength();
        const h = handle.getBoundingClientRect();
        const clipOf = (el: HTMLElement) => /inset\(([^)]*)\)/.exec(getComputedStyle(el).clipPath)?.[1].split(" ").map((v) => Number.parseFloat(v)) ?? [];
        const r = retailer.getBoundingClientRect();
        const u = uncle.getBoundingClientRect();
        const rc = retailerCol.getBoundingClientRect();
        const uc = uncleCol.getBoundingClientRect();
        return {
          start: toPage(path.getPointAtLength(0)),
          end: toPage(path.getPointAtLength(length)),
          length,
          dot: { x: h.x + h.width / 2, y: h.y + h.height / 2 },
          retailer: { right: Math.min(r.right, rc.right - (clipOf(retailerCol)[1] ?? 0)), cy: r.y + r.height / 2 },
          uncle: { left: Math.max(u.left, uc.left + (clipOf(uncleCol)[3] ?? 0)), cy: u.y + u.height / 2 },
        };
      });
      expect(geometry).not.toBeNull();
      if (!geometry) return;
      expect(Math.abs(geometry.start.x - geometry.retailer.right)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(geometry.start.y - geometry.retailer.cy)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(geometry.end.x - geometry.uncle.left)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(geometry.end.y - geometry.uncle.cy)).toBeLessThanOrEqual(1.5);
      const passesDot = await page.evaluate(({ dot }) => {
        const path = document.querySelector<SVGPathElement>("[data-roles-connector]");
        const origin = path?.ownerSVGElement?.getBoundingClientRect();
        if (!path || !origin) return Number.POSITIVE_INFINITY;
        const total = path.getTotalLength();
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i <= 400; i += 1) {
          const p = path.getPointAtLength((total * i) / 400);
          best = Math.min(best, Math.hypot(origin.x + p.x - dot.x, origin.y + p.y - dot.y));
        }
        return best;
      }, geometry);
      expect(passesDot).toBeLessThanOrEqual(1.5);
    }
  });

  test("pointer drag moves the seam with inertia inside 25-75%", async ({ page }, testInfo) => {
    test.skip(!isDesktop(testInfo), "the seam exists from 1024px");
    await showStage(page);
    const handle = slider(page);
    const box = await rectOf(handle);
    const startX = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(startX - i * 40, y);
    await page.mouse.up();

    if (isReduced(testInfo)) {
      // Reduced motion: no seam drag (spec 6.5); the keyboard still moves it.
      await page.waitForTimeout(400);
      await expect(handle).toHaveAttribute("aria-valuenow", "50");
      return;
    }
    await expect(handle).toHaveAttribute("aria-valuenow", "25");
    await expect.poll(() => seamValue(page)).toBeCloseTo(0.25, 2);

    const back = await rectOf(handle);
    await page.mouse.move(back.x + back.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) await page.mouse.move(back.x + back.width / 2 + i * 30, y);
    await page.mouse.up();
    await expect.poll(async () => Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(40);
    const settled = Number(await handle.getAttribute("aria-valuenow"));
    expect(settled).toBeGreaterThanOrEqual(25);
    expect(settled).toBeLessThanOrEqual(75);
  });

  test("one clip plays at a time and pauses out of view", async ({ page }, testInfo) => {
    await showStage(page);
    await page.getByRole("button", { name: PLAY.retailer }).click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    expect(await playing(page)).toEqual([APP_CLIPS.retailerDenimDetail.id]);
    await expect(page.getByRole("button", { name: roles.pause })).toHaveCount(1);
    await section(page).screenshot({ path: testInfo.outputPath(`roles-playing-${testInfo.project.name}.png`) });

    if (isDesktop(testInfo)) {
      // Desktop: the uncle's play yields the retailer's decoder and restores its still.
      await page.getByRole("button", { name: PLAY.uncle }).click();
      await expect(media(page, "uncle")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
      await expect.poll(() => playing(page)).toEqual([APP_CLIPS.uncleHome.id]);
      await expect(media(page, "retailer")).toHaveAttribute("data-state", "still");
    } else {
      // Mobile: switching roles pauses the clip on the hidden device.
      await page.getByRole("radio", { name: roles.toggle.options[1] }).check();
      await expect.poll(() => playing(page)).toEqual([]);
      await page.getByRole("button", { name: PLAY.uncle }).click();
      await expect(media(page, "uncle")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
      await expect.poll(() => playing(page)).toEqual([APP_CLIPS.uncleHome.id]);
    }

    // Scrolled out of view (below 25% visible), the clip pauses.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => playing(page)).toEqual([]);
  });

  test("an interrupted clip goes back to its still, with the outline and the connector", async ({ page }, testInfo) => {
    if (!isDesktop(testInfo)) await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
    await showStage(page);
    await side(page, "retailer").getByRole("button", { name: PLAY.retailer }).click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    await expect.poll(async () => (await overlays(page)).retailer).toBe("0");

    if (isDesktop(testInfo)) {
      // The other clip takes the decoder: the retailer's home and its outline come back.
      await side(page, "uncle").getByRole("button", { name: PLAY.uncle }).click();
      await expect(media(page, "uncle")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
      await expect(media(page, "retailer")).toHaveAttribute("data-state", "still");
      await expect.poll(async () => (await overlays(page)).retailer).toBe("1");
      await expect(side(page, "retailer").getByRole("button", { name: PLAY.retailer })).toBeVisible();
      expect(await media(page, "retailer").locator("video").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(0);
      await section(page).screenshot({ path: testInfo.outputPath(`roles-yield-${testInfo.project.name}.png`) });

      // Scrolled away (below 25% visible) and back: both homes, both outlines and the connector.
      // Trust's top at the viewport top, so no part of the phones is left on screen.
      await jumpTo(page, "trust", { inset: 450 });
      await expect.poll(() => playing(page)).toEqual([]);
      await showStage(page);
      await expect.poll(() => overlays(page)).toEqual({ retailer: "1", uncle: "1", connector: "1" });
    } else {
      // The toggle switches away and back: the retailer's home and its outline are there again.
      await page.getByRole("radio", { name: roles.toggle.options[1] }).check();
      await expect.poll(() => playing(page)).toEqual([]);
      await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
      await expect(side(page, "retailer")).toHaveCSS("opacity", "1");
      await expect(media(page, "retailer")).toHaveAttribute("data-state", "still");
      await expect.poll(async () => (await overlays(page)).retailer).toBe("1");
      expect(await media(page, "retailer").locator("video").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBe(0);
    }
  });

  test("the reader's own pause keeps the paused frame", async ({ page }, testInfo) => {
    if (!isDesktop(testInfo)) await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
    await showStage(page);
    const button = side(page, "retailer").getByRole("button", { name: PLAY.retailer });
    await button.click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "playing", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await side(page, "retailer").getByRole("button", { name: roles.pause }).click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "paused");
    expect(await media(page, "retailer").locator("video").evaluate((video) => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
    await expect.poll(async () => (await overlays(page)).retailer).toBe("0");
  });

  test("a rejected play() keeps the still and the play button", async ({ page }, testInfo) => {
    // As on iOS Low Power Mode or a blocked autoplay: play() rejects with NotAllowedError.
    await page.addInitScript(() => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
        if (this.closest('[data-clip="retailerDenimDetail"]')) {
          return Promise.reject(new DOMException("The request is not allowed.", "NotAllowedError"));
        }
        return original.call(this);
      };
    });
    await openPage(page);
    if (!isDesktop(testInfo)) await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
    await showStage(page);
    const button = side(page, "retailer").getByRole("button", { name: PLAY.retailer });
    await button.click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "still", { timeout: 15_000 });
    await expect(button).toBeVisible();
    await expect(side(page, "retailer").locator(".device-media img")).toBeVisible();
    expect(await playing(page)).toEqual([]);
  });

  test("a clip whose files all fail returns to the still and frees the decoder", async ({ page }, testInfo) => {
    // Every <source> fails (404 or a dropped connection): the browser never rejects play(),
    // so the media manager must notice the last source's error itself (WP-16 report).
    await page.route(/retailer-denim-detail\.(webm|mp4)$/, (route) => route.abort());
    await openPage(page);
    if (!isDesktop(testInfo)) await page.getByRole("radio", { name: roles.toggle.options[0] }).check();
    await showStage(page);
    const button = side(page, "retailer").getByRole("button", { name: PLAY.retailer });
    await button.click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "still", { timeout: 15_000 });
    await expect(button).toBeVisible();
    // A second try runs the same failure path instead of waiting forever.
    await button.click();
    await expect(media(page, "retailer")).toHaveAttribute("data-state", "still", { timeout: 15_000 });
    await expect(side(page, "retailer").getByRole("button", { name: PLAY.retailer })).toBeVisible();
    // The decoder is free: the other clip still plays.
    if (isDesktop(testInfo)) {
      await side(page, "uncle").getByRole("button", { name: PLAY.uncle }).click();
      await expect.poll(() => playing(page), { timeout: 15_000 }).toEqual([APP_CLIPS.uncleHome.id]);
    }
  });

  test("below 1024px the toggle shows one device at a time", async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), "the toggle replaces the seam below 1024px");
    const group = page.getByRole("radiogroup", { name: roles.toggle.label });
    await expect(group).toBeVisible();
    await expect(slider(page)).toBeHidden();
    const retailerRadio = page.getByRole("radio", { name: roles.toggle.options[0] });
    const uncleRadio = page.getByRole("radio", { name: roles.toggle.options[1] });
    await expect(retailerRadio).toBeChecked();
    await expect(side(page, "uncle")).toHaveCSS("visibility", "hidden");
    await expect(page.getByRole("button", { name: PLAY.retailer })).toBeVisible();

    await uncleRadio.check();
    await expect(uncleRadio).toBeChecked();
    await expect(side(page, "uncle")).toHaveCSS("opacity", "1");
    await expect(side(page, "retailer")).toHaveCSS("visibility", "hidden");
    await expect(page.getByRole("button", { name: PLAY.uncle })).toBeVisible();
    await expect(page.getByRole("button", { name: PLAY.retailer })).toBeHidden();
    await showStage(page);
    await section(page).screenshot({ path: testInfo.outputPath("roles-mobile-uncle.png") });

    // The toggle stays under the nav while the device scrolls past, so the switch and the
    // outlined card are on screen together, and the card clears the record pill.
    await expect.poll(async () => (await rectOf(group)).y).toBeLessThan(100);
    const card = await rectOf(side(page, "uncle").locator(".roles-outline path"));
    const toggle = await rectOf(group);
    expect(card.y).toBeGreaterThan(toggle.y + toggle.height);
    expect(card.y + card.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? 844);

    // The device stays inside the viewport: no horizontal overflow.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("below 1024px the stuck toggle is a header: nothing shows cut between it and the nav", async ({ page }, testInfo) => {
    test.skip(isDesktop(testInfo), "the toggle replaces the seam below 1024px");
    const group = page.getByRole("radiogroup", { name: roles.toggle.label });
    // The day ground, #EDECE3.
    const rgb = [237, 236, 227];
    /** Largest channel distance from the ground in a full-width strip of the viewport (0 when it is all ground). */
    const strip = async (top: number, height: number) => {
      const png = await page.screenshot({ clip: { x: 0, y: top, width: page.viewportSize()?.width ?? 390, height } });
      const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let worst = 0;
      for (let i = 0; i < data.length; i += 3) {
        worst = Math.max(worst, Math.abs((data[i] ?? 0) - (rgb[0] ?? 0)), Math.abs((data[i + 1] ?? 0) - (rgb[1] ?? 0)), Math.abs((data[i + 2] ?? 0) - (rgb[2] ?? 0)));
      }
      return worst;
    };
    const putStageTopAt = async (y: number) => {
      await page.evaluate((top) => {
        const stageTop = document.querySelector(".roles-stage")?.getBoundingClientRect().top;
        if (stageTop === undefined) throw new Error("no roles stage");
        window.scrollTo({ top: window.scrollY + stageTop - top, behavior: "instant" });
      }, y);
      await settle(page);
    };

    for (const radio of [0, 1]) {
      await page.getByRole("radio", { name: roles.toggle.options[radio] }).check();
      // Stuck, at the role line and at the device's header and list: the device runs under the toggle.
      for (const at of [-40, -200, -450]) {
        await putStageTopAt(at);
        const toggle = await rectOf(group);
        const nav = await rectOf(page.locator(".au-nav-pill"));
        expect(toggle.y).toBeCloseTo(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-clear"))), 0);
        // The strip between the nav's bottom and the toggle's top is ground only: the soft shadows of
        // the nav and the toggle tint it (about 20 levels), the device's #101010 bezel or text would not.
        expect(await strip(Math.ceil(nav.y + nav.height) + 1, Math.floor(toggle.y - nav.y - nav.height) - 2)).toBeLessThanOrEqual(40);
        if (radio === 0 && at === -200) await page.screenshot({ path: testInfo.outputPath("roles-mobile-stuck.png") });
      }
    }

    // At rest (not stuck) the band is hidden: the body copy above the toggle is untouched.
    await putStageTopAt(300);
    const body = await rectOf(section(page).locator(".roles-copy p"));
    const toggle = await rectOf(group);
    expect(body.y + body.height).toBeLessThan(toggle.y);
    expect(await strip(Math.round(body.y), Math.round(body.height))).toBeGreaterThan(100);
  });
});
