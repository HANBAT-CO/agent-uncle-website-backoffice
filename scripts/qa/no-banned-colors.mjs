// Spec 4.1 and 15: green is the only key colour.
//
//   node scripts/qa/no-banned-colors.mjs
//
// Scans every text file under src/ and public/ (svg, css, json) for:
// 1. the banned hex values E8572E FF5B35 C6FF3A D9704F (any case, with or
//    without #) and the words orange, amber and lime on word boundaries
//    (so "timeline" or "chamber" never match);
// 2. the app's reds #E42939 and #D22030 (red lives only inside real
//    footage and screenshots, never in site styles);
// 3. every colour literal (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba() with
//    commas, spaces or Tailwind underscores) whose hue falls in a banned
//    family at real saturation: orange and red-orange (hue 8-60), lime
//    (65-100), red (below 8 or above 345) and purple (260-320). Saturation
//    and value are HSV, as in the film colour audit (scripts/media), so
//    near-whites such as the mint #F2FFE8 are not mistaken for lime.
// scripts/media is out of scope on purpose: its audit vocabulary must name
// the banned colours. Exit 1 on any finding.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fail, findLines, pass, read, rel, textFiles } from "./lib.mjs";

const TAG = "no-banned-colors";

const BANNED_HEX = /(?<![0-9a-f])#?(?:e8572e|ff5b35|c6ff3a|d9704f)(?![0-9a-f])/i;
const BANNED_WORDS = /\b(?:orange|amber|lime)\b/i;
const APP_REDS = /#(?:e42939|d22030)(?![0-9a-f])/i;
const HEX_LITERAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z_-])/gi;
const RGB_LITERAL = /rgba?\(\s*(\d{1,3})[\s,_]+(\d{1,3})[\s,_]+(\d{1,3})/gi;

/** HSV of an sRGB triple (0-255): hue in degrees, saturation and value 0-1. */
export function hsv(r, g, b) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

/** The banned family a colour belongs to, or null. */
export function bannedFamily(r, g, b) {
  const { hue, saturation, value } = hsv(r, g, b);
  if (value < 0.35) return null;
  if (saturation > 0.5 && hue >= 8 && hue <= 60) return "orange";
  if (saturation > 0.5 && hue >= 65 && hue <= 100) return "lime";
  if (saturation > 0.5 && (hue < 8 || hue > 345)) return "red";
  if (saturation > 0.3 && hue >= 260 && hue <= 320) return "purple";
  return null;
}

function parseHex(literal) {
  let hex = literal.slice(1);
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const files = [...textFiles("src"), ...textFiles("public")];
  let findings = 0;
  const report = (file, hit, why) => {
    findings += 1;
    fail(TAG, `${rel(file)}:${hit.line}:${hit.column} ${why} (${hit.match}): ${hit.text}`);
  };

  for (const file of files) {
    const text = read(file);
    for (const hit of findLines(text, BANNED_HEX)) report(file, hit, "banned hex");
    for (const hit of findLines(text, BANNED_WORDS)) report(file, hit, "banned colour word");
    for (const hit of findLines(text, APP_REDS)) report(file, hit, "app red outside real media");
    for (const hit of findLines(text, HEX_LITERAL)) {
      const family = bannedFamily(...parseHex(hit.match));
      if (family) report(file, hit, `${family} colour`);
    }
    for (const hit of findLines(text, RGB_LITERAL)) {
      const [r, g, b] = hit.match.match(/\d{1,3}/g).map(Number);
      const family = bannedFamily(r, g, b);
      if (family) report(file, hit, `${family} colour`);
    }
  }

  if (findings === 0) pass(TAG, `${files.length} files in src/ and public/, no banned colours`);
}
