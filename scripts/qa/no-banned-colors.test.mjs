import assert from "node:assert/strict";
import { test } from "node:test";

import { bannedFamily, colourFindings, hueFamily, isAdminPath } from "./no-banned-colors.mjs";

const rgb = (hex) => [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

test("flags the spec's banned hexes and the app reds", () => {
  assert.equal(bannedFamily(...rgb("E8572E")), "orange");
  assert.equal(bannedFamily(...rgb("FF5B35")), "orange");
  assert.equal(bannedFamily(...rgb("D9704F")), "orange");
  assert.equal(bannedFamily(...rgb("C6FF3A")), "lime");
  assert.equal(bannedFamily(...rgb("E42939")), "red");
  assert.equal(bannedFamily(...rgb("D22030")), "red");
  assert.equal(bannedFamily(...rgb("7C3AED")), "purple");
});

test("passes the brand palette, mint included", () => {
  for (const hex of ["0C483E", "07231C", "093A32", "F2FFE8", "B6D7C2", "EDECE3", "F5F4EE", "101010", "636363", "D7D7D7", "E4E3DA", "111111"]) {
    assert.equal(bannedFamily(...rgb(hex)), null, hex);
  }
});

test("hueFamily reads #rgb and #rrggbb literals", () => {
  assert.equal(hueFamily("#E8572E"), "orange");
  assert.equal(hueFamily("#d22030"), "red");
  assert.equal(hueFamily("#0c483e"), null);
  assert.equal(hueFamily("#f60"), "orange");
});

test("only the console folders count as admin paths", () => {
  for (const path of ["src/app/(admin)/admin.css", "src/app/(admin)/admin/(console)/page.tsx", "src/components/admin/ui/badge.tsx", "src/lib/admin/labels.ts"]) {
    assert.equal(isAdminPath(path), true, path);
  }
  for (const path of ["src/app/(site)/globals.css", "src/components/chrome/chrome.css", "src/lib/administrator.ts", "public/admin/x.svg", "src/app/admin.css"]) {
    assert.equal(isAdminPath(path), false, path);
  }
});

const reasons = (text, path) => colourFindings(text, path).map((finding) => finding.why);

test("the app reds stay banned outside the console", () => {
  assert.deepEqual(reasons("--x: #D22030;", "src/components/chrome/chrome.css"), ["app red outside real media", "red colour"]);
  assert.deepEqual(reasons("color: #e42939;", "src/app/(site)/globals.css"), ["app red outside real media", "red colour"]);
});

test("admin paths may use the app reds and the attention text red, nothing else red", () => {
  assert.deepEqual(reasons("--status-attention-bg: color-mix(in oklab, #d22030 12%, transparent);", "src/app/(admin)/admin.css"), []);
  assert.deepEqual(reasons("--destructive: #E42939; --status-attention-fg: #b3192a;", "src/components/admin/ui/x.tsx"), []);
  assert.deepEqual(reasons("color: rgb(210, 32, 48);", "src/lib/admin/x.ts"), []);
  assert.deepEqual(reasons("color: #ff0000;", "src/app/(admin)/admin.css"), ["red colour"]);
  assert.deepEqual(reasons("color: rgb(255 0 0);", "src/components/admin/x.tsx"), ["red colour"]);
});

test("orange, lime, purple and the banned words still fail inside admin paths", () => {
  assert.deepEqual(reasons("color: #E8572E;", "src/components/admin/ui/badge.tsx"), ["banned hex", "orange colour"]);
  assert.deepEqual(reasons("color: #ff8a00;", "src/app/(admin)/admin.css"), ["orange colour"]);
  assert.deepEqual(reasons("color: #a3e635;", "src/lib/admin/x.ts"), ["lime colour"]);
  assert.deepEqual(reasons("color: #7c3aed;", "src/app/(admin)/admin.css"), ["purple colour"]);
  assert.deepEqual(reasons('const tone = "orange";', "src/components/admin/x.tsx"), ["banned colour word"]);
});
