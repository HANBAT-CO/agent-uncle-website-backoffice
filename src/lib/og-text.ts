/**
 * Text drawn by the share image (src/app/opengraph-image.tsx) and the
 * characters its TTF subsets must hold (scripts/fonts/og-fonts.mjs,
 * src/app/fonts/og-fonts.test.ts). The subset script reads site.ts directly
 * with the same mapping; the test fails if the two ever disagree.
 */
import { site } from "./site";

export const OG_TEXT = {
  /** 사입삼춘, set in Paperlogy 900; the period is drawn as the mint dot. */
  wordmark: site.name,
  /** The official one-liner, Paperlogy 400. */
  line: site.oneLiner,
} as const;

/** Every character each OG font weight renders. */
export const OG_FONT_TEXT = {
  900: OG_TEXT.wordmark,
  400: OG_TEXT.line,
} as const;
