import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { openPage, settle } from "../chrome-helpers";

/**
 * Rendered-page scans (spec 4.1, 4.2, 6.4, 14, 15), after every lazy island
 * has mounted:
 * - exactly one h1;
 * - no em dash (U+2014) or en dash (U+2013) anywhere in the rendered text,
 *   accessible names or alt text;
 * - no eyebrow-like labels: no uppercase text transform, no small text with
 *   wide tracking;
 * - no scroll cue: no element whose text is Scroll or 스크롤;
 * - no banned colour family (orange, lime, red, purple) in any computed text,
 *   background, border, outline, fill or stroke colour (real footage and
 *   screenshots are pixels, not styles, so they are out of this scan);
 * - nav text keeps WCAG AA against the pixels behind it at 62% of the dawn
 *   pin, the frame where the page switches from night to day (spec S5).
 */

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);

async function mountEverything(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await settle(page);
  // The signup form mounts within one viewport; make sure it is there before scanning.
  await page.locator("#lead-form").waitFor({ state: "attached", timeout: 20_000 });
}

test.describe("global: rendered text and colour scans", () => {
  test.setTimeout(180_000);

  test("one h1, no dashes, no eyebrows, no scroll cues", async ({ page }) => {
    await openPage(page);
    await mountEverything(page);

    await expect(page.locator("h1")).toHaveCount(1);

    const report = await page.evaluate(
      ({ em, en }) => {
        const dashes: string[] = [];
        const eyebrows: string[] = [];
        const cues: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? "";
          const parent = node.parentElement;
          if (!parent || parent.closest("script, style, noscript, template")) continue;
          if (text.includes(em) || text.includes(en)) dashes.push(text.trim().slice(0, 80));
          const trimmed = text.trim();
          if (!trimmed) continue;
          if (/^(scroll|스크롤)\b/i.test(trimmed) || /^(scroll|스크롤)$/i.test(trimmed)) cues.push(trimmed);
          const style = getComputedStyle(parent);
          const size = Number.parseFloat(style.fontSize) || 16;
          const tracking = style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing) || 0;
          if (style.textTransform === "uppercase" || (size <= 14 && tracking / size >= 0.08)) {
            eyebrows.push(`${parent.tagName.toLowerCase()}.${parent.className}: ${trimmed.slice(0, 40)}`);
          }
        }
        for (const element of document.querySelectorAll<HTMLElement>("[aria-label], [alt], [title], [placeholder]")) {
          for (const attribute of ["aria-label", "alt", "title", "placeholder"]) {
            const value = element.getAttribute(attribute) ?? "";
            if (value.includes(em) || value.includes(en)) dashes.push(`${attribute}: ${value.slice(0, 80)}`);
          }
        }
        return { dashes, eyebrows, cues };
      },
      { em: EM_DASH, en: EN_DASH },
    );

    expect(report.dashes, "em or en dashes in the rendered page").toEqual([]);
    expect(report.eyebrows, "uppercase or widely tracked small labels").toEqual([]);
    expect(report.cues, "scroll cues").toEqual([]);
  });

  test("no banned colour family in computed styles", async ({ page }) => {
    await openPage(page);
    await mountEverything(page);

    const offenders = await page.evaluate(() => {
      const parse = (value: string): [number, number, number, number] | null => {
        const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
        if (match) {
          const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? Number.parseFloat(match[4]) / 100 : Number.parseFloat(match[4]);
          return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
        }
        const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
        if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
        return null;
      };
      const family = ([r, g, b, a]: [number, number, number, number]): string | null => {
        if (a < 0.05) return null;
        const max = Math.max(r, g, b) / 255;
        const min = Math.min(r, g, b) / 255;
        const delta = max - min;
        if (max < 0.35 || delta === 0) return null;
        const saturation = delta / max;
        let hue: number;
        if (max === r / 255) hue = 60 * ((((g - b) / 255 / delta) % 6) + 6) % 360;
        else if (max === g / 255) hue = 60 * ((b - r) / 255 / delta + 2);
        else hue = 60 * ((r - g) / 255 / delta + 4);
        if (saturation > 0.5 && hue >= 8 && hue <= 60) return "orange";
        if (saturation > 0.5 && hue >= 65 && hue <= 100) return "lime";
        if (saturation > 0.5 && (hue < 8 || hue > 345)) return "red";
        if (saturation > 0.3 && hue >= 260 && hue <= 320) return "purple";
        return null;
      };
      const properties = ["color", "background-color", "border-top-color", "border-bottom-color", "outline-color", "fill", "stroke", "text-decoration-color"];
      const found: string[] = [];
      for (const element of document.querySelectorAll<Element>("body *")) {
        if (element.closest("video, picture, img, canvas, script, style")) continue;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        for (const property of properties) {
          const value = style.getPropertyValue(property);
          const rgba = parse(value);
          const hit = rgba ? family(rgba) : null;
          if (hit) found.push(`${hit} ${property} ${value} on ${element.tagName.toLowerCase()}.${String(element.getAttribute("class") ?? "").slice(0, 60)}`);
        }
      }
      return [...new Set(found)].slice(0, 40);
    });
    expect(offenders).toEqual([]);
  });

  test("nav text keeps AA contrast at 62% of the dawn pin", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the dawn pin and its mid-switch frame exist on desktop motion only");
    await openPage(page);
    await page.evaluate(() => {
      const dawn = document.querySelector<HTMLElement>('[data-section="dawn"]');
      if (!dawn) throw new Error("no dawn section");
      const top = dawn.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.round(top + 0.62 * 1.2 * window.innerHeight), behavior: "instant" });
    });
    await settle(page);
    await page.waitForTimeout(1500); // the 700ms phase transition and the sky's next frame

    const link = page.locator('header nav a[href="#route"]');
    const box = await link.boundingBox();
    if (!box) throw new Error("no nav link");
    const textColor = await link.evaluate((node) => getComputedStyle(node).color);
    const [tr, tg, tb] = (textColor.match(/[\d.]+/g) ?? []).map(Number);

    // The pixels around the link inside the pill, minus the glyphs: the darkest or lightest
    // 20% (the text itself) is dropped and the rest is the background the text sits on.
    const png = await page.screenshot({ clip: { x: box.x - 6, y: box.y, width: box.width + 12, height: box.height } });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const luminance = (r: number, g: number, b: number) => {
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const textL = luminance(tr, tg, tb);
    const pixels: number[] = [];
    for (let i = 0; i < info.width * info.height; i += 1) pixels.push(luminance(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]));
    // Background pixels are the ones furthest from the text colour.
    pixels.sort((a, b) => Math.abs(b - textL) - Math.abs(a - textL));
    const background = pixels.slice(0, Math.floor(pixels.length * 0.6));
    const worst = background.reduce((closest, value) => (Math.abs(value - textL) < Math.abs(closest - textL) ? value : closest), background[0]);
    const ratio = (Math.max(textL, worst) + 0.05) / (Math.min(textL, worst) + 0.05);
    testInfo.annotations.push({ type: "nav contrast at dawn 62%", description: ratio.toFixed(2) });
    expect(ratio, `nav text ${textColor} against the pill at the dawn switch`).toBeGreaterThanOrEqual(4.5);
  });
});
