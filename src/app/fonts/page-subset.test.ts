import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pageCodePoints, pageUnicodeRanges } from "../../../scripts/fonts/page-chars.mjs";
import { woff2CodePoints } from "../../../scripts/fonts/woff2-cmap.mjs";

/**
 * The 400 and 700 page subsets must draw every character the page prints,
 * and the generated unicode-range literals in paperlogy.ts must match the
 * current page text. After a copy change run `npm run fonts:page`.
 */
const root = process.cwd();
const page = pageCodePoints(root);

describe("Paperlogy page subsets", () => {
  for (const weight of [400, 700] as const) {
    it(`paperlogy-${weight}-page.woff2 covers the page text`, () => {
      const subset = woff2CodePoints(readFileSync(join(root, `src/app/fonts/paperlogy-${weight}-page.woff2`)));
      const missing = page.filter((code) => code !== 0x20 && code !== 0xa0 && !subset.has(code)).map((code) => String.fromCodePoint(code));
      expect(missing).toEqual([]);
    });

    it(`paperlogy-${weight}-page.woff2 stays a page subset`, () => {
      expect(readFileSync(join(root, `src/app/fonts/paperlogy-${weight}-page.woff2`)).byteLength).toBeLessThan(48 * 1024);
    });
  }

  it("paperlogy.ts carries the current page and rest unicode-ranges", () => {
    const loader = readFileSync(join(root, "src/app/fonts/paperlogy.ts"), "utf8");
    const generated = (marker: string) =>
      [...loader.matchAll(new RegExp(`// @generated ${marker}\\n\\s*\\{ prop: "unicode-range", value: "([^"]*)"`, "g"))].map((match) => match[1]);
    const { page: pageRange, rest } = pageUnicodeRanges(root);
    expect(generated("page-range")).toEqual([pageRange, pageRange]);
    expect(generated("rest-range")).toEqual([rest]);
  });
});
