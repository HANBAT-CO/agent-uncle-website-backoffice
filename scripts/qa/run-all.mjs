// The whole QA run (spec 13, 14, 15; WP-20 release checklist).
//
//   npm run qa                         every gate below
//   npm run qa -- --skip=e2e,lighthouse    skip named steps (ids in the table)
//   npm run qa -- --release            also enforce the release gates
//   npm run qa -- --reuse-server       use a production server already on QA_URL
//
// Steps, in order (a failed step does not stop the run; steps that need a
// build or a server are skipped when those failed):
//   lint, typecheck, unit (vitest), node-tests (media + qa scripts),
//   map-check, media-verify, media-audit, film-ready, no-banned-colors,
//   build, bundle-size (report), server (next start on 3200, LEAD_DRY_RUN=1),
//   no-dash (src + served HTML), e2e (Playwright, all projects, against the
//   production server), lighthouse (mobile + desktop budgets), release.
// bundle-size reports the initial JS against the 85 KB budget but only
// fails the run with --strict-bundle (see docs/qa/2026-10-landing.md).
// Release gates (warnings unless --release): no open LEGAL_BLOCKERS,
// NEXT_PUBLIC_SITE_URL set to a public origin, LEAD_DRY_RUN unset.
//
// Concurrent Playwright runs must not share an output folder (they delete
// each other's artifacts), so the e2e step writes to test-results/qa-e2e.

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_QA_URL, ROOT } from "./lib.mjs";

const args = process.argv.slice(2);
const skip = new Set((args.find((arg) => arg.startsWith("--skip="))?.slice("--skip=".length) ?? "").split(",").filter(Boolean));
const release = args.includes("--release");
const strictBundle = args.includes("--strict-bundle");
const reuseServer = args.includes("--reuse-server");
const qaUrl = (process.env.QA_URL || DEFAULT_QA_URL).replace(/\/$/, "");
const port = new URL(qaUrl).port || "3200";

const results = [];

function run(id, command, commandArgs, { env = {}, fatal = true } = {}) {
  if (skip.has(id)) {
    results.push({ id, status: "skipped", ms: 0 });
    return true;
  }
  const started = Date.now();
  console.log(`\n=== [qa] ${id}: ${command} ${commandArgs.join(" ")}`);
  const outcome = spawnSync(command, commandArgs, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
  const ok = outcome.status === 0;
  results.push({ id, status: ok ? "pass" : fatal ? "FAIL" : "warn", ms: Date.now() - started });
  return ok;
}

function note(id, ok, message, { fatal = true } = {}) {
  console.log(`\n=== [qa] ${id}: ${message}`);
  results.push({ id, status: ok ? "pass" : fatal ? "FAIL" : "warn", ms: 0, message });
  return ok;
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function serverUp(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    return false;
  }
}

/* ---------- static gates ---------- */

run("lint", "npm", ["run", "lint"]);
run("typecheck", "npm", ["run", "typecheck"]);
run("unit", "npm", ["test"]);
run("node-tests", "node", ["--test", "scripts/media/**/*.test.mjs", "scripts/qa/*.test.mjs"]);
run("map-check", "npm", ["run", "map", "--", "--check"]);
run("media-verify", "npm", ["run", "media:verify"]);
run("media-audit", "npm", ["run", "media:audit"]);

if (!skip.has("film-ready")) {
  const film = JSON.parse(readFileSync(join(ROOT, "src/content/generated/film.json"), "utf8"));
  note("film-ready", film.ready === true, `src/content/generated/film.json ready is ${film.ready} (duration ${film.duration}s, ${film.chapters?.length ?? 0} chapters)`);
} else results.push({ id: "film-ready", status: "skipped", ms: 0 });

run("no-banned-colors", "node", ["scripts/qa/no-banned-colors.mjs"]);

/* ---------- build and server ---------- */

const built = reuseServer ? true : run("build", "npx", ["next", "build"]);
if (built && !reuseServer) run("bundle-size", "node", ["scripts/qa/bundle-size.mjs", "--attribute"], { fatal: strictBundle });

let server = null;
let serverReady = false;
if (!skip.has("server") && built) {
  if (reuseServer) {
    serverReady = note("server", await serverUp(`${qaUrl}/`), `reusing ${qaUrl}`);
  } else if (await serverUp(`${qaUrl}/`)) {
    serverReady = note("server", false, `${qaUrl} is already taken; stop that server or pass --reuse-server (it must serve this build)`);
  } else {
    console.log(`\n=== [qa] server: next start -p ${port} (LEAD_DRY_RUN=1)`);
    server = spawn("npx", ["next", "start", "-p", port], {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, LEAD_DRY_RUN: "1" },
      detached: true,
    });
    serverReady = note("server", await waitForServer(`${qaUrl}/`), `production server on ${qaUrl}`);
  }
} else {
  results.push({ id: "server", status: "skipped", ms: 0 });
}

/* ---------- gates that need the server ---------- */

if (serverReady) {
  run("no-dash", "node", ["scripts/qa/no-dash.mjs", `--url=${qaUrl}`]);
  run("e2e", "npx", ["playwright", "test", "--output=test-results/qa-e2e", ...(process.env.QA_WORKERS ? [`--workers=${process.env.QA_WORKERS}`] : [])], {
    env: { PLAYWRIGHT_BASE_URL: qaUrl },
  });
  run("lighthouse", "node", ["scripts/qa/lighthouse.mjs", `--url=${qaUrl}`, `--runs=${process.env.QA_LIGHTHOUSE_RUNS ?? "3"}`]);
} else {
  run("no-dash", "node", ["scripts/qa/no-dash.mjs", "--no-html"]);
  for (const id of ["e2e", "lighthouse"]) results.push({ id, status: skip.has(id) ? "skipped" : "FAIL", ms: 0, message: "no server" });
}

if (server) {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

/* ---------- release gates ---------- */

if (!skip.has("release")) {
  const legal = spawnSync(
    "node",
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--input-type=module",
      "-e",
      "const { LEGAL_BLOCKERS } = await import('./src/content/legal.ts'); console.log(JSON.stringify(LEGAL_BLOCKERS));",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  const blockers = legal.status === 0 ? JSON.parse(legal.stdout) : [{ item: "could not read src/content/legal.ts", question: legal.stderr }];
  note(
    "release:legal",
    blockers.length === 0,
    blockers.length === 0 ? "no open legal blockers" : `open client blockers: ${blockers.map((b) => `${b.item} (${b.question})`).join("; ")}`,
    { fatal: release },
  );
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const publicOrigin = /^https:\/\//.test(siteUrl) && !/localhost|127\.0\.0\.1/.test(siteUrl);
  note(
    "release:site-url",
    publicOrigin || Boolean(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    publicOrigin ? `NEXT_PUBLIC_SITE_URL=${siteUrl}` : "NEXT_PUBLIC_SITE_URL is not a public https origin: canonical, sitemap, robots and JSON-LD would point at localhost",
    { fatal: release },
  );
  note("release:lead-dry-run", process.env.LEAD_DRY_RUN !== "1", "LEAD_DRY_RUN must be unset in production (the QA server sets it for itself only)", { fatal: release });
}

/* ---------- summary ---------- */

console.log("\n=== [qa] summary");
for (const result of results) {
  const time = result.ms ? ` ${(result.ms / 1000).toFixed(1)}s` : "";
  console.log(`  ${result.status.padEnd(7)} ${result.id}${time}${result.message ? `  ${result.message}` : ""}`);
}
const failed = results.filter((result) => result.status === "FAIL");
if (failed.length > 0) {
  console.log(`\n[qa] ${failed.length} gate(s) failed: ${failed.map((result) => result.id).join(", ")}`);
  process.exit(1);
}
console.log("\n[qa] all gates passed");
