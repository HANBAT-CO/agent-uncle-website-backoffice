// Page subsets of Paperlogy 400 and 700 (spec 13 performance budget).
//
//   npm run fonts:page
//
// The full KS X 1001 files are about 116 KB each; the page itself prints only
// a few hundred characters. This script:
// 1. collects the page text (scripts/fonts/page-chars.mjs),
// 2. writes src/app/fonts/paperlogy-{400,700}-page.woff2 with exactly those
//    characters (pyftsubset via uv, from the committed full files),
// 3. rewrites the two generated unicode-range literals in
//    src/app/fonts/paperlogy.ts: the page subsets cover the page text, the
//    full files cover everything else, so they download only when a visitor
//    types a character the page never prints.
// Run it after any copy change (src/app/fonts/page-subset.test.ts fails while
// the subsets or the ranges are stale), together with `npm run fonts:display`
// when a heading changed.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatRanges, pageCodePoints, pageUnicodeRanges, toRanges } from "./page-chars.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const codePoints = pageCodePoints(root);
const textFile = join(tmpdir(), `paperlogy-page-${process.pid}.txt`);
writeFileSync(textFile, String.fromCodePoint(...codePoints));

for (const weight of [400, 700]) {
  const output = `src/app/fonts/paperlogy-${weight}-page.woff2`;
  execFileSync(
    "uv",
    [
      "run",
      "--no-project",
      "--with",
      "fonttools",
      "--with",
      "brotli",
      "pyftsubset",
      join(root, `src/app/fonts/paperlogy-${weight}.woff2`),
      `--text-file=${textFile}`,
      "--flavor=woff2",
      "--layout-features=*",
      "--name-IDs=0,1,2,3,4,5,6,7,8,9,11,13,14",
      "--name-languages=*",
      "--drop-tables+=vhea,vmtx,DSIG",
      "--desubroutinize",
      "--no-hinting",
      `--output-file=${join(root, output)}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  console.log(`[fonts:page] ${output}: ${(statSync(join(root, output)).size / 1024).toFixed(1)} KB`);
}

const { page, rest } = pageUnicodeRanges(root);
const loader = join(root, "src/app/fonts/paperlogy.ts");
let source = readFileSync(loader, "utf8");
const replaceGenerated = (marker, value) => {
  const pattern = new RegExp(`(// @generated ${marker}\\n\\s*\\{ prop: "unicode-range", value: )"[^"]*"`, "g");
  const matches = source.match(pattern);
  if (!matches) throw new Error(`[fonts:page] no "// @generated ${marker}" unicode-range line in paperlogy.ts`);
  source = source.replace(pattern, `$1"${value}"`);
  return matches.length;
};
const pageCount = replaceGenerated("page-range", page);
const restCount = replaceGenerated("rest-range", rest);
writeFileSync(loader, source);
console.log(
  `[fonts:page] ${codePoints.length} characters in ${toRanges(codePoints).length} ranges; rewrote ${pageCount} page and ${restCount} rest ranges in src/app/fonts/paperlogy.ts (${formatRanges(toRanges(codePoints)).length} chars)`,
);
