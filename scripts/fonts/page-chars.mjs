// The characters the landing page itself prints at weights 400 and 700, and
// the unicode-range strings that split Paperlogy into page subsets and the
// full KS X 1001 files (src/app/fonts/paperlogy.ts).
//
// Page text = printable ASCII (typed contacts, digits, times) plus every
// non-ASCII character in a non-test .ts/.tsx/.json/.mjs file under src/ that
// the full font can draw (copy, glossary, legal, story, media alt text, and
// any literal in a component). Visitor input outside this set (a name typed
// into the form) still renders in Paperlogy: those characters fall in the
// complement range, served by the full files on demand.
//
// Shared by scripts/fonts/page-subset.mjs (builds the files) and
// src/app/fonts/page-subset.test.ts (fails when copy changes and the subsets
// or the ranges in paperlogy.ts are stale).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { woff2CodePoints } from "./woff2-cmap.mjs";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".json", ".mjs"]);
const MAX_CODE_POINT = 0x10ffff;

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (SOURCE_EXTENSIONS.has(extname(name)) && !/\.test\.[a-z]+$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Sorted code points the page prints, limited to those the full font has.
 * @param {string} root repository root
 * @returns {number[]}
 */
export function pageCodePoints(root) {
  const font = woff2CodePoints(readFileSync(join(root, "src/app/fonts/paperlogy-400.woff2")));
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c += 1) set.add(c);
  for (const file of sourceFiles(join(root, "src"))) {
    for (const char of readFileSync(file, "utf8")) {
      const code = char.codePointAt(0) ?? 0;
      if (code >= 0x80 && font.has(code)) set.add(code);
    }
  }
  return [...set].filter((code) => font.has(code)).sort((a, b) => a - b);
}

/** @param {number[]} sorted @returns {Array<[number, number]>} */
export function toRanges(sorted) {
  const ranges = [];
  for (const code of sorted) {
    const last = ranges.at(-1);
    if (last && last[1] === code - 1) last[1] = code;
    else ranges.push([code, code]);
  }
  return ranges;
}

/** Everything from U+0000 to U+10FFFF not covered by `ranges`. @param {Array<[number, number]>} ranges */
export function complementRanges(ranges) {
  const out = [];
  let next = 0;
  for (const [start, end] of ranges) {
    if (start > next) out.push([next, start - 1]);
    next = end + 1;
  }
  if (next <= MAX_CODE_POINT) out.push([next, MAX_CODE_POINT]);
  return out;
}

/** CSS unicode-range value, e.g. "U+20-7E,U+B7,U+AC00". @param {Array<[number, number]>} ranges */
export function formatRanges(ranges) {
  const hex = (code) => code.toString(16).toUpperCase();
  return ranges.map(([start, end]) => (start === end ? `U+${hex(start)}` : `U+${hex(start)}-${hex(end)}`)).join(",");
}

/** Both unicode-range values for the current page text. @param {string} root */
export function pageUnicodeRanges(root) {
  const ranges = toRanges(pageCodePoints(root));
  return { page: formatRanges(ranges), rest: formatRanges(complementRanges(ranges)) };
}
