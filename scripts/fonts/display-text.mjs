// Write the character lists for the Paperlogy display subsets.
//
//   npm run fonts:display      (this script, then pyftsubset for 800 and 900)
//
// Input:  src/content/copy.ts DISPLAY_800 (H1 lines and every H2) and
//         DISPLAY_900 (사입삼춘. digits ≤ 장), loaded with Node type stripping.
// Output: scripts/fonts/display-800.txt and display-900.txt, the unique
//         characters plus a space and basic punctuation, sorted by code point.
//         pyftsubset --text-file reads them to build
//         src/app/fonts/paperlogy-{800,900}-display.woff2.
//
// src/content/content.test.ts reads the generated WOFF2 cmaps and fails when
// a display string uses a character the subset lacks, so copy changes cannot
// silently fall back to a system font.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DISPLAY_800, DISPLAY_900 } from "../../src/content/copy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Always kept: space and the punctuation a heading may grow. */
export const BASIC = " .,?!'\"‘’“”·:;()-";

/** Unique characters of the strings plus BASIC, sorted by code point. */
export function displayChars(strings) {
  const chars = new Set([...BASIC]);
  for (const line of strings) for (const ch of line) chars.add(ch);
  return [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("");
}

const outputs = [
  { file: "display-800.txt", strings: DISPLAY_800 },
  { file: "display-900.txt", strings: DISPLAY_900 },
];

for (const { file, strings } of outputs) {
  const text = displayChars(strings);
  writeFileSync(path.join(here, file), `${text}\n`);
  console.log(`${file}: ${[...text].length} characters`);
}
