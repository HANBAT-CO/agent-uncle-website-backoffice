import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sfntCodePoints } from "../../../scripts/fonts/woff2-cmap.mjs";
import { OG_FONT_TEXT } from "../../lib/og-text";

/**
 * The share image renders with two TTF subsets (scripts/fonts/og-fonts.mjs).
 * A character missing from its subset would fall back to nothing in Satori,
 * so every character the image draws must be in the matching file.
 */
const FILES = {
  900: "src/app/fonts/og/paperlogy-900-og.ttf",
  400: "src/app/fonts/og/paperlogy-400-og.ttf",
} as const;

describe("OG image font subsets", () => {
  for (const weight of [900, 400] as const) {
    it(`covers every character drawn at weight ${weight}`, () => {
      const codePoints = sfntCodePoints(readFileSync(join(process.cwd(), FILES[weight])));
      const missing = [...new Set(OG_FONT_TEXT[weight])].filter(
        (char) => char !== " " && !codePoints.has(char.codePointAt(0) ?? 0),
      );
      expect(missing).toEqual([]);
    });

    it(`keeps the weight ${weight} subset small`, () => {
      expect(readFileSync(join(process.cwd(), FILES[weight])).byteLength).toBeLessThan(40 * 1024);
    });
  }
});
