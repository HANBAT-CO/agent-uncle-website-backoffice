import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { footer, plate } from "../../src/content/copy";
import { COMPANY } from "../../src/content/legal";

/**
 * S11 footer (WP-19): the wordmark never overflows from 320 to 1920px (one
 * line from 768px, 사입 / 삼춘. below and on screens 500px tall or less), the
 * quantity dot lands on the period of 사입삼춘. (the period glyph's ink
 * across, the syllables' floor down, within 2px), the end of the page holds
 * the whole wordmark clear of the nav (landscape phones included), the
 * entrance plays where it can be seen (never under the open record column)
 * and never replays in sight, the one-liner stays readable to assistive tech,
 * reduced motion keeps it static, and the visit log mirrors sessionStorage.
 */

const VISITOR_KEY = "au:visitor";

const SAMPLE_RECORDS = [
  { id: "answer-wait-test-1", kind: "answer-wait", time: "09:52", meta: "업무 기록 · 09:52", title: "미송을 기다리기로 했어요", tag: "예시" },
  { id: "signup-test-2", kind: "signup", time: "09:58", meta: "신청 기록 · 09:58", title: "사전 신청을 보냈어요" },
] as const;

/** Below this width (and at 500px tall or less) the wordmark sets on two lines and closes the footer (footer.css). */
const STACKED_BELOW = 768;

/**
 * Scrolls to the very bottom until the page stops growing: lazy islands above
 * the footer (the form, other sections' media) mount as they come near and
 * can push the footer back below the viewport after a single jump.
 */
async function scrollToFooter(page: Page) {
  await page.locator("footer#footer").waitFor();
  let previous = -1;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const height = await page.evaluate(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
      return document.documentElement.scrollHeight;
    });
    if (height === previous) break;
    previous = height;
    await page.waitForTimeout(400);
  }
}

/** Scrolls so the footer's top sits at `fraction` of the viewport height. */
async function placeFooterTop(page: Page, fraction: number) {
  await page.evaluate((at) => {
    const top = document.getElementById("footer")!.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top - window.innerHeight * at, behavior: "instant" });
  }, fraction);
}

/** Waits until the dot has finished its drop, squash and settle (identity transform, fully visible). */
async function waitForDotAtRest(page: Page) {
  await expect
    .poll(
      () =>
        page.locator("[data-footer-dot]").evaluate((node) => {
          const style = getComputedStyle(node);
          const still = style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)";
          return still && style.visibility !== "hidden" && Number(style.opacity) === 1;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

/** The ink box of the dark pixels in a PNG, in CSS px relative to the clip. */
async function inkBox(png: Buffer, scale: number) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luminance < 110) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { left: minX / scale, top: minY / scale, right: (maxX + 1) / scale, bottom: (maxY + 1) / scale };
}

test.describe("S11 footer", () => {
  test("the wordmark fits inside the gutters from 320 to 1920px: two lines below 768px, one line above", async ({ page }) => {
    await page.goto("/");
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await scrollToFooter(page);
      const fit = await page.evaluate(() => {
        const heading = document.getElementById("footer-title");
        const slot = document.querySelector("[data-footer-slot]");
        const container = heading?.parentElement;
        if (!heading || !slot || !container) return null;
        const headingBox = heading.getBoundingClientRect();
        const slotBox = slot.getBoundingClientRect();
        const containerBox = container.getBoundingClientRect();
        const contentRight = containerBox.right - parseFloat(getComputedStyle(container).paddingRight);
        return {
          viewport: window.innerWidth,
          headingScroll: heading.scrollWidth - heading.clientWidth,
          contentRight,
          slotRight: slotBox.right,
          lines: Math.round(headingBox.height / parseFloat(getComputedStyle(heading).fontSize)),
        };
      });
      expect(fit, `width ${width}`).not.toBeNull();
      // The full stop ends inside the gutter: nothing spills past the content box or the viewport.
      expect(fit!.headingScroll, `width ${width}`).toBeLessThanOrEqual(0);
      expect(fit!.slotRight, `width ${width}`).toBeLessThanOrEqual(fit!.contentRight + 0.5);
      expect(fit!.slotRight, `width ${width}`).toBeLessThanOrEqual(fit!.viewport);
      expect(fit!.lines, `width ${width}`).toBe(width < STACKED_BELOW ? 2 : 1);
    }
  });

  test("the wordmark reads 사입삼춘. and the dot lands on the period, on the syllables' floor, within 2px", async ({ page }) => {
    await page.goto("/");
    await scrollToFooter(page);
    await waitForDotAtRest(page);
    await expect(page.getByRole("heading", { level: 2, name: `${footer.wordmark}${footer.period}` })).toBeVisible();

    const dot = await page.locator("[data-footer-dot]").boundingBox();
    expect(dot).not.toBeNull();
    const scale = await page.evaluate(() => window.devicePixelRatio);

    // The syllables' ink (the dot sits outside this box, in the slot).
    const chars = page.locator("[data-footer-chars]");
    const charsBox = await chars.boundingBox();
    expect(charsBox).not.toBeNull();
    const charsInk = await inkBox(await page.screenshot({ clip: charsBox!, scale: "device" }), scale);

    // Show the period glyph itself, hide the dot, and find the glyph's ink.
    const slot = page.locator("[data-footer-slot]");
    await slot.evaluate((node) => {
      (node as HTMLElement).style.color = "#101010";
      (node.querySelector("[data-footer-dot]") as HTMLElement).style.visibility = "hidden";
    });
    const slotBox = await slot.boundingBox();
    expect(slotBox).not.toBeNull();
    const ink = await inkBox(await page.screenshot({ clip: slotBox!, scale: "device" }), scale);

    const glyph = {
      left: slotBox!.x + ink.left,
      right: slotBox!.x + ink.right,
      height: ink.bottom - ink.top,
    };
    const floor = charsBox!.y + charsInk.bottom;
    const tolerance = 2;
    // Across and in size: the period glyph. Down: the Hangul floor (입, 삼, 춘), not the Latin baseline.
    expect(Math.abs(dot!.x - glyph.left)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(dot!.x + dot!.width - glyph.right)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(dot!.height - glyph.height)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(dot!.y + dot!.height - floor)).toBeLessThanOrEqual(tolerance);
  });

  test("the dot is the page's ink dot: deep green, round", async ({ page }) => {
    await page.goto("/");
    await scrollToFooter(page);
    await waitForDotAtRest(page);
    const dot = page.locator('[data-footer-dot] [data-dot="ink"]');
    await expect(dot).toHaveCSS("background-color", "rgb(12, 72, 62)");
    const round = await dot.evaluate((node) => {
      const style = getComputedStyle(node);
      return parseFloat(style.borderTopLeftRadius) >= node.getBoundingClientRect().width / 2;
    });
    expect(round).toBe(true);
  });

  test("at the end of the page on short laptops and tablets the wordmark clears the nav", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop project only");
    test.setTimeout(240_000);
    for (const [width, height] of [
      [1280, 720],
      [1280, 800],
      [1366, 768],
      [1440, 780],
      [1440, 900],
      // One line below 1024px: split windows and tablets in landscape.
      [1023, 768],
      [1000, 700],
    ] as const) {
      // A fresh load per size: a resize refreshes every pin above and can move the scroll position.
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await scrollToFooter(page);
      await waitForDotAtRest(page);
      const frame = await page.evaluate(() => ({
        headingTop: document.getElementById("footer-title")!.getBoundingClientRect().top,
        footerTop: document.getElementById("footer")!.getBoundingClientRect().top,
      }));
      const nav = await page.getByRole("banner").boundingBox();
      const size = `${width}x${height}`;
      expect(frame.headingTop, size).toBeGreaterThanOrEqual(nav!.y + nav!.height + 8);
      // The whole footer fits the screen: wordmark, card, links and legal line in one frame.
      expect(frame.footerTop, size).toBeGreaterThanOrEqual(-1);
    }
  });

  test("on tall screens the end of the page still plays the whole entrance", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop project only");
    test.setTimeout(150_000);
    // The footer is shorter than about half of these screens, so its top never scrolls past the centre.
    for (const [width, height] of [
      [1080, 1920],
      [3840, 2160],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await scrollToFooter(page);
      await waitForDotAtRest(page);
      const size = `${width}x${height}`;
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const chars = [...document.querySelectorAll(".footer-char")].map((node) => getComputedStyle(node).transform);
              const typed = [...document.querySelectorAll("[data-footer-line] span span")].map((node) => getComputedStyle(node).opacity);
              return {
                chars: chars.length,
                risen: chars.every((transform) => transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)"),
                typed: typed.length > 0 && typed.every((opacity) => opacity === "1"),
              };
            }),
          { message: size, timeout: 10_000 },
        )
        .toEqual({ chars: footer.wordmark.length, risen: true, typed: true });
    }
  });

  test("on desktop no syllable rises under the open record column, and all four stand once it folds, before the full stop", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop project only");
    test.setTimeout(90_000);
    await page.goto("/");
    await scrollToFooter(page);
    // Below the viewport (resets the entrance), then the wordmark's top at the bottom edge.
    await placeFooterTop(page, 1.3);
    await expect.poll(() => page.locator("[data-footer-dot]").evaluate((node) => getComputedStyle(node).visibility)).toBe("hidden");
    await page.evaluate(() => {
      const heading = document.getElementById("footer-title")!.getBoundingClientRect();
      window.scrollBy({ top: heading.top - window.innerHeight, behavior: "instant" });
    });

    // Every frame from here: the showing part of each syllable (inside its line
    // mask) never shares a pixel with the rail, the plate or the compact plate
    // while they show, sliding out included.
    await page.evaluate(() => {
      const probe = window as unknown as { __footerOverlaps: string[]; __footerProbe: boolean };
      probe.__footerOverlaps = [];
      probe.__footerProbe = true;
      const frame = () => {
        if (!probe.__footerProbe) return;
        const parts = [...document.querySelectorAll<HTMLElement>("[data-record-column] :is(.au-rail-panel, .au-plate-full, .au-plate-compact)")]
          .filter((part) => getComputedStyle(part).visibility !== "hidden")
          .map((part) => part.getBoundingClientRect());
        for (const char of document.querySelectorAll<HTMLElement>(".footer-char")) {
          const box = char.getBoundingClientRect();
          const mask = char.closest("[data-footer-mask]")!.getBoundingClientRect();
          const top = Math.max(box.top, mask.top);
          const bottom = Math.min(box.bottom, mask.bottom, window.innerHeight);
          if (bottom - top < 1) continue;
          for (const part of parts) {
            const across = Math.min(box.right, part.right) - Math.max(box.left, part.left);
            const down = Math.min(bottom, part.bottom) - Math.max(top, part.top);
            if (across > 1 && down > 1) probe.__footerOverlaps.push(`${char.textContent} ${Math.round(across)}x${Math.round(down)}`);
          }
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    // Down in 20px steps until the column has folded and the wordmark's top is past its start (85%).
    const state = () =>
      page.evaluate(() => {
        const column = document.querySelector<HTMLElement>("[data-record-column]")!;
        return {
          folded: column.dataset.railMode === "pill" && column.dataset.plateMode === "hidden",
          headingTop: document.getElementById("footer-title")!.getBoundingClientRect().top / window.innerHeight,
        };
      });
    let now = await state();
    for (let step = 0; step < 80 && !(now.folded && now.headingTop <= 0.85); step += 1) {
      await page.evaluate(() => window.scrollBy({ top: 20, behavior: "instant" }));
      await page.waitForTimeout(100);
      now = await state();
    }
    expect(now.folded && now.headingTop <= 0.85).toBe(true);

    // All four stand without waiting for the finale (the dot's slot is still low on the screen).
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>(".footer-char")].map((node) => Math.abs(new DOMMatrix(getComputedStyle(node).transform).m42) < 0.5),
          ),
        { timeout: 5_000 },
      )
      .toEqual([true, true, true, true]);
    expect(await page.locator("[data-footer-dot]").evaluate((node) => getComputedStyle(node).visibility)).toBe("hidden");
    const overlaps = await page.evaluate(() => {
      const probe = window as unknown as { __footerOverlaps: string[]; __footerProbe: boolean };
      probe.__footerProbe = false;
      return probe.__footerOverlaps;
    });
    expect(overlaps).toEqual([]);

    // Then the end of the page completes it: the full stop and the line.
    await scrollToFooter(page);
    await waitForDotAtRest(page);
    const chars = await page.evaluate(() => [...document.querySelectorAll(".footer-char")].map((node) => getComputedStyle(node).transform));
    for (const transform of chars) expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
  });

  test("on phones the page ends on the whole wordmark, clear of the nav", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "covered by the motion projects");
    test.setTimeout(120_000);
    const sizes = testInfo.project.name === "mobile" ? ([[390, 844]] as const) : ([[390, 844], [375, 667], [320, 568]] as const);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await scrollToFooter(page);
      await waitForDotAtRest(page);
      const frame = await page.evaluate(() => {
        const heading = document.getElementById("footer-title")!.getBoundingClientRect();
        const dot = document.querySelector("[data-footer-dot]")!.getBoundingClientRect();
        return {
          headingTop: heading.top,
          headingBottom: heading.bottom,
          dotBottom: dot.bottom,
          viewport: window.innerHeight,
        };
      });
      const nav = await page.getByRole("banner").boundingBox();
      const size = `${width}x${height}`;
      expect(frame.headingTop, size).toBeGreaterThanOrEqual(nav!.y + nav!.height + 8);
      expect(frame.headingBottom, size).toBeLessThanOrEqual(frame.viewport);
      expect(frame.dotBottom, size).toBeLessThanOrEqual(frame.viewport);
    }
  });

  test("on landscape phones and short windows the page ends on the whole two-line wordmark, the legal line beside it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "covered by the motion projects");
    test.setTimeout(240_000);
    const sizes =
      testInfo.project.name === "mobile"
        ? ([[844, 390]] as const)
        : ([
            [844, 390],
            [667, 375],
            [568, 320],
            [932, 430],
            [1024, 500],
            [1280, 480],
          ] as const);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await scrollToFooter(page);
      await waitForDotAtRest(page);
      const frame = await page.evaluate(() => {
        const heading = document.getElementById("footer-title")!;
        const box = heading.getBoundingClientRect();
        const dot = document.querySelector("[data-footer-dot]")!.getBoundingClientRect();
        return {
          heading: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          lines: Math.round(box.height / parseFloat(getComputedStyle(heading).fontSize)),
          dotBottom: dot.bottom,
          viewport: window.innerHeight,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const nav = await page.getByRole("banner").boundingBox();
      const size = `${width}x${height}`;
      expect(frame.lines, size).toBe(2);
      expect(frame.heading.top, size).toBeGreaterThanOrEqual(nav!.y + nav!.height + 8);
      expect(frame.heading.bottom, size).toBeLessThanOrEqual(frame.viewport);
      expect(frame.dotBottom, size).toBeLessThanOrEqual(frame.viewport);
      expect(frame.overflow, size).toBeLessThanOrEqual(0);
      // The symbol and the © line close the frame with it: on screen, clear of the nav, never over the wordmark.
      const footerBox = page.locator("footer#footer");
      for (const legal of [footerBox.locator("img"), footerBox.getByText(COMPANY.line)]) {
        const part = await legal.boundingBox();
        expect(part, size).not.toBeNull();
        expect(part!.y, size).toBeGreaterThanOrEqual(nav!.y + nav!.height);
        expect(part!.y + part!.height, size).toBeLessThanOrEqual(frame.viewport);
        const across = Math.min(part!.x + part!.width, frame.heading.right) - Math.max(part!.x, frame.heading.left);
        const down = Math.min(part!.y + part!.height, frame.heading.bottom) - Math.max(part!.y, frame.heading.top);
        expect(across > 0 && down > 0, `${size}: legal line over the wordmark`).toBe(false);
      }
    }
  });

  test("the dot drops where it can be seen: on screen, nothing over it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no drop under reduced motion");
    await page.goto("/");
    await scrollToFooter(page);
    // Leave the footer below the viewport (resets the entrance), then come down in small steps.
    await placeFooterTop(page, 1.3);
    await expect.poll(() => page.locator("[data-footer-dot]").evaluate((node) => getComputedStyle(node).visibility)).toBe("hidden");
    // Stop at the trigger: the dot itself shows (the syllables rise earlier, as
    // the wordmark enters and the record column folds, so it sets off at once).
    let fired = false;
    for (let step = 0; step < 150 && !fired; step += 1) {
      await page.evaluate(() => window.scrollBy({ top: 40, behavior: "instant" }));
      await page.waitForTimeout(60);
      fired = await page.locator("[data-footer-dot]").evaluate((node) => getComputedStyle(node).visibility !== "hidden");
    }
    expect(fired).toBe(true);
    await waitForDotAtRest(page);

    const landing = await page.evaluate(() => {
      const box = document.querySelector("[data-footer-dot]")!.getBoundingClientRect();
      const x = (box.left + box.right) / 2;
      const y = (box.top + box.bottom) / 2;
      const top = document.elementFromPoint(x, y);
      return {
        top: box.top,
        bottom: box.bottom,
        viewport: window.innerHeight,
        uncovered: Boolean(top?.closest("[data-footer-dot]")),
        cover: top ? `${top.tagName} ${top.className}` : null,
      };
    });
    expect(landing.top).toBeGreaterThanOrEqual(0);
    expect(landing.bottom).toBeLessThanOrEqual(landing.viewport);
    // Not under the open record column, the nav or the signup's submit bar.
    expect(landing.uncovered, `covered by ${landing.cover}`).toBe(true);
  });

  test("the entrance does not replay while the wordmark is in sight", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no entrance under reduced motion");
    await page.goto("/");
    await scrollToFooter(page);
    await waitForDotAtRest(page);
    // Back up until the footer's top is at 85% of the screen (still in view), then down again.
    await placeFooterTop(page, 0.85);
    await page.waitForTimeout(400);
    await scrollToFooter(page);
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => ({
      chars: [...document.querySelectorAll(".footer-char")].map((node) => getComputedStyle(node).transform),
      dot: getComputedStyle(document.querySelector("[data-footer-dot]")!).visibility,
    }));
    expect(state.chars.length).toBe(footer.wordmark.length);
    for (const transform of state.chars) expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
    expect(state.dot).not.toBe("hidden");
  });

  test("the one-liner stays in the accessibility tree before it types on", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "no type-on under reduced motion");
    await page.goto("/");
    await scrollToFooter(page);
    // Below the viewport again: split and reset to its start state (every syllable at opacity 0).
    await placeFooterTop(page, 1.3);
    await expect
      .poll(() => page.locator("[data-footer-line] span span").first().evaluate((node) => getComputedStyle(node).opacity))
      .toBe("0");
    expect(await page.locator("[data-footer-line]").ariaSnapshot()).toContain(footer.line);
  });

  test("the record column is folded whenever the wordmark is on screen, scrolling down and back up", async ({ page }, testInfo) => {
    // Reduced motion draws the whole wordmark at once and swaps the column's modes at once, so any
    // frame where the plate or a rail card is open over the wordmark shows. The band that failed:
    // footer top at 75-82% of the viewport (plate and bottom cards over 춘 from 1024px).
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    test.setTimeout(90_000);
    const overlaps = () =>
      page.evaluate(
        () =>
          new Promise<string[]>((resolve) =>
            // Two frames: the column's fold is read on the next animation frame after a scroll.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const title = document.getElementById("footer-title")!;
                const chars = title.querySelector("[data-footer-chars]")!.getBoundingClientRect();
                const slot = title.querySelector("[data-footer-slot]")!.getBoundingClientRect();
                const glyphs = {
                  left: chars.left,
                  right: Math.max(chars.right, slot.right),
                  top: Math.max(Math.min(chars.top, slot.top), 0),
                  bottom: Math.min(Math.max(chars.bottom, slot.bottom), window.innerHeight),
                };
                const shown = (node: Element) => {
                  for (let at: Element | null = node; at; at = at.parentElement) {
                    const style = getComputedStyle(at);
                    if (style.visibility === "hidden" || style.display === "none") return false;
                  }
                  return true;
                };
                const hits: string[] = [];
                for (const part of document.querySelectorAll("[data-record-column] :is([data-plate], [data-rail-entry])")) {
                  if (!shown(part)) continue;
                  const box = part.getBoundingClientRect();
                  const across = Math.min(glyphs.right, box.right) - Math.max(glyphs.left, box.left);
                  const down = Math.min(glyphs.bottom, box.bottom) - Math.max(glyphs.top, box.top);
                  if (across > 1 && down > 1) {
                    const name = part.getAttribute("data-plate") ?? part.getAttribute("data-rail-entry");
                    hits.push(`${name} ${Math.round(across)}x${Math.round(down)}`);
                  }
                }
                resolve(hits);
              }),
            ),
          ),
      );
    for (const [width, height] of [
      [1440, 900],
      [1100, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await page.locator("[data-chrome-root][data-hydrated]").waitFor({ state: "attached" });
      await scrollToFooter(page);
      // From below the fold up to 60%, then back down below the fold.
      const sweep = [1.3, 0.95, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.6];
      for (const fraction of [...sweep, ...sweep.slice(0, -1).reverse()]) {
        await placeFooterTop(page, fraction);
        expect(await overlaps(), `${width}x${height}, footer top at ${fraction}`).toEqual([]);
      }
      // The verifier's frame: footer top at 78%, the column folded.
      await placeFooterTop(page, 0.78);
      await expect(page.locator("[data-record-column]")).toHaveAttribute("data-plate-mode", "hidden");
    }
  });

  test("reduced motion shows the composed wordmark with the dot in place at once", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "reduced-motion", "reduced-motion project only");
    await page.goto("/");
    await scrollToFooter(page);
    // No split syllables, no drop: the server-rendered composition, immediately.
    await expect(page.locator("[data-footer-chars]")).toHaveText(footer.wordmark);
    expect(await page.locator(".footer-char").count()).toBe(0);
    const transform = await page.locator("[data-footer-dot]").evaluate((node) => getComputedStyle(node).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transform);
    await expect(page.locator("[data-footer-line]")).toHaveText(footer.line);
  });

  test("the visit log lists this visit's records from sessionStorage", async ({ page }) => {
    await page.addInitScript(
      ([key, records]) => sessionStorage.setItem(key, JSON.stringify(records)),
      [VISITOR_KEY, SAMPLE_RECORDS] as const,
    );
    await page.goto("/");
    await scrollToFooter(page);

    const log = page.locator("[data-visit-log]");
    await expect(log.getByRole("heading", { level: 3, name: footer.visitLog.heading })).toBeVisible();
    const rows = log.locator("[data-visit-record]");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("업무 기록 · 09:52");
    await expect(rows.nth(0)).toContainText("미송을 기다리기로 했어요");
    await expect(rows.nth(0)).toContainText(plate.sampleChip);
    await expect(rows.nth(1)).toContainText("신청 기록 · 09:58");
    await expect(rows.nth(1)).toContainText("사전 신청을 보냈어요");
    await expect(rows.nth(1)).not.toContainText(plate.sampleChip);
  });

  test("without records there is no visit log, and the links and legal line are present", async ({ page }) => {
    await page.goto("/");
    await scrollToFooter(page);
    await expect(page.locator("[data-visit-log]")).toHaveCount(0);

    const links = page.getByRole("navigation", { name: footer.linksLabel }).getByRole("link");
    await expect(links).toHaveText(footer.links.map((link) => link.label));
    for (const link of footer.links) {
      await expect(page.getByRole("navigation", { name: footer.linksLabel }).getByRole("link", { name: link.label })).toHaveAttribute(
        "href",
        link.href,
      );
    }
    await expect(page.locator("footer#footer")).toContainText(COMPANY.line);
    await expect(page.locator("footer#footer").getByText(footer.callback.date)).toBeVisible();
  });
});
