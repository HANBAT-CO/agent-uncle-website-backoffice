// Spec 15: zero em dashes (U+2014) and zero en dashes (U+2013) in the page.
//
//   node scripts/qa/no-dash.mjs [--url=http://localhost:3200] [--no-html]
//
// Scans every text file under src/ (copy lives in src/content, but strings
// also sit in components, alt text and metadata) and the HTML the production
// server returns for the home page (server-rendered text, metadata, JSON-LD
// and the RSC payload). The rendered DOM after hydration and lazy islands is
// covered by tests/e2e/global/text-scan.spec.ts. Exit 1 on any finding.

import { fail, fetchText, findLines, pass, qaUrl, read, rel, textFiles } from "./lib.mjs";

const TAG = "no-dash";
// Built from code points so this file never contains the characters itself.
const DASHES = new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`, "u");
const NAMES = { [String.fromCodePoint(0x2014)]: "U+2014 em dash", [String.fromCodePoint(0x2013)]: "U+2013 en dash" };

let findings = 0;
const files = textFiles("src");
for (const file of files) {
  for (const hit of findLines(read(file), DASHES)) {
    findings += 1;
    fail(TAG, `${rel(file)}:${hit.line}:${hit.column} ${NAMES[hit.match]}: ${hit.text}`);
  }
}
if (findings === 0) pass(TAG, `src: ${files.length} files, no em or en dashes`);

if (!process.argv.includes("--no-html")) {
  const url = `${qaUrl()}/`;
  let html;
  try {
    html = await fetchText(url);
  } catch (error) {
    fail(TAG, `could not load ${url} (${error.message}). Start the production server (npx next start -p 3200) or pass --no-html.`);
  }
  if (html !== undefined) {
    const hits = findLines(html, DASHES);
    for (const hit of hits) fail(TAG, `${url} ${NAMES[hit.match]} near: ${hit.text}`);
    if (hits.length === 0) pass(TAG, `${url}: ${(html.length / 1024).toFixed(0)} KB of HTML, no em or en dashes`);
  }
}
