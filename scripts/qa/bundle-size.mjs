// Spec 13 initial JS budget: at most 85 KB gzip beyond the Next/React runtime.
//
//   npx next build && node scripts/qa/bundle-size.mjs [--budget=85] [--attribute] [--json]
//
// Reads the prerendered home page (.next/server/app/index.html) for the
// <script src> tags the browser fetches at load, gzips each file (level 9,
// like a CDN), and splits them into:
// - runtime: the root bootstrap chunks Next lists in build-manifest.json
//   (rootMainFiles: React, React DOM, the Next client and Turbopack runtime),
//   plus the nomodule polyfill file, which modern browsers never download;
// - page: everything else in the initial HTML (the home page's own client
//   code and its libraries).
// Lazy chunks (next/dynamic, import()) are not in the HTML and not counted.
//
// --attribute runs `next analyze --output` (Turbopack's module analyzer, no
// rebuild) and attributes the page chunks to modules. Turbopack bundles part
// of the App Router runtime (layout router, error boundaries, client page and
// segment, next/dynamic) into the page chunks rather than the root chunks;
// that share is Next's runtime, so it is reported and subtracted from the page
// total ("page JS beyond the runtime"). The analyzer compresses each module on
// its own, so the share is applied as a proportion of the measured gzip total.
//
// Fails when the page total beyond the runtime exceeds the budget.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { fail, pass, ROOT } from "./lib.mjs";

const TAG = "bundle-size";
const budgetFlag = process.argv.find((arg) => arg.startsWith("--budget="));
const BUDGET_KB = budgetFlag ? Number(budgetFlag.slice("--budget=".length)) : 85;
const ATTRIBUTE = process.argv.includes("--attribute");
const JSON_OUT = process.argv.includes("--json");

const next = join(ROOT, ".next");
const manifest = JSON.parse(readFileSync(join(next, "build-manifest.json"), "utf8"));
const runtimeFiles = new Set([...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])]);
const polyfills = new Set(manifest.polyfillFiles ?? []);
const html = readFileSync(join(next, "server", "app", "index.html"), "utf8");
const scripts = [...new Set([...html.matchAll(/<script[^>]*\ssrc="\/_next\/([^"]+\.js)"/g)].map((match) => match[1]))];

const rows = scripts.map((file) => {
  const bytes = readFileSync(join(next, file));
  return {
    file,
    raw: statSync(join(next, file)).size,
    gzip: gzipSync(bytes, { level: 9 }).length,
    kind: polyfills.has(file) ? "polyfill" : runtimeFiles.has(file) ? "runtime" : "page",
  };
});

const kb = (bytes) => (bytes / 1024).toFixed(1);
const total = (kind) => rows.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.gzip, 0);
const page = total("page");

/**
 * Module attribution of the page chunks from Turbopack's analyzer: the
 * render-dependent output files of the build (not the bootstrap ones), each
 * module's individually compressed size, grouped by package or src folder.
 */
function attribute() {
  const run = spawnSync("npx", ["next", "analyze", "--output"], { cwd: ROOT, encoding: "utf8" });
  const dataPath = join(next, "diagnostics", "analyze", "data", "analyze.data");
  if (run.status !== 0 || !existsSync(dataPath)) return { error: `next analyze failed: ${(run.stderr || run.stdout).trim().split("\n").at(-1)}` };
  const buffer = readFileSync(dataPath);
  const headerLength = buffer.readUInt32BE(0);
  const data = JSON.parse(buffer.subarray(4, 4 + headerLength).toString("utf8"));
  const pathOf = (index) => {
    const parts = [];
    for (let current = index; current !== undefined && current !== null && data.sources[current]; current = data.sources[current].parent_source_index) {
      parts.unshift(data.sources[current].path);
    }
    return parts.join("");
  };
  const bootstrap = new Set();
  const render = new Set();
  for (const group of data.chunk_groups) {
    if (group.kind === "bootstrap") group.output_file_indices.forEach((index) => bootstrap.add(index));
    if (group.kind === "render_dependent") group.output_file_indices.forEach((index) => render.add(index));
  }
  const groups = new Map();
  let all = 0;
  let framework = 0;
  for (const part of data.chunk_parts) {
    const file = part.output_file_index;
    if (!render.has(file) || bootstrap.has(file) || !data.output_files[file].filename.endsWith(".js")) continue;
    const path = pathOf(part.source_index);
    const pkg = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
    const key = pkg ? `npm:${pkg}` : path.replace(/^\[project\]\//, "").split("/").slice(0, 4).join("/");
    groups.set(key, (groups.get(key) ?? 0) + part.compressed_size);
    all += part.compressed_size;
    if (pkg === "next") framework += part.compressed_size;
  }
  return { share: all > 0 ? framework / all : 0, groups: [...groups].sort((a, b) => b[1] - a[1]) };
}

const attribution = ATTRIBUTE ? attribute() : null;
const frameworkShare = attribution && !attribution.error ? attribution.share : 0;
const pageFramework = Math.round(page * frameworkShare);
const beyondRuntime = page - pageFramework;

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { budgetKb: BUDGET_KB, runtimeGzip: total("runtime"), pageGzip: page, pageFrameworkGzip: pageFramework, beyondRuntimeGzip: beyondRuntime, rows, attribution },
      null,
      2,
    ),
  );
} else {
  for (const row of rows.sort((a, b) => a.kind.localeCompare(b.kind) || b.gzip - a.gzip)) {
    console.log(`[${TAG}] ${row.kind.padEnd(8)} ${kb(row.gzip).padStart(6)} KB gz ${kb(row.raw).padStart(7)} KB raw  ${row.file}`);
  }
  console.log(`[${TAG}] runtime ${kb(total("runtime"))} KB gz (not counted), polyfill ${kb(total("polyfill"))} KB gz (nomodule only)`);
  if (attribution?.error) console.log(`[${TAG}] attribution skipped: ${attribution.error}`);
  else if (attribution) {
    console.log(`[${TAG}] page chunks ${kb(page)} KB gz, of which Next's App Router runtime about ${kb(pageFramework)} KB (${(frameworkShare * 100).toFixed(1)}%)`);
    console.log(`[${TAG}] largest parts of the page chunks (each module compressed alone, so they sum above the total):`);
    for (const [key, size] of attribution.groups.slice(0, 24)) console.log(`[${TAG}]   ${kb(size).padStart(6)} KB  ${key}`);
  }
}

const label = attribution && !attribution.error ? "initial page JS beyond the runtime" : "initial page JS";
if (beyondRuntime / 1024 <= BUDGET_KB) pass(TAG, `${label} ${kb(beyondRuntime)} KB gzip (budget ${BUDGET_KB} KB)`);
else fail(TAG, `${label} ${kb(beyondRuntime)} KB gzip is over the ${BUDGET_KB} KB budget`);
