#!/usr/bin/env node
// Compare the LOCAL backoffice stack's schema with the LIVE project (READ-ONLY).
//
//   node supabase-local/scripts/verify-schema.mjs            # summary + diff, exit 1 on mismatch
//   node supabase-local/scripts/verify-schema.mjs --json DIR # also write both fingerprints to DIR
//
// Live side: one SELECT (schema-fingerprint.sql) sent to the Management API endpoint
// POST /v1/projects/{ref}/database/query/read-only. Nothing is written to the live project.
// Token: $SUPABASE_ACCESS_TOKEN, ~/.supabase/access-token, or the macOS keychain item
// "Supabase CLI" (the one `supabase login` creates). The token is never printed.
// Local side: the same SQL through psql inside the local db container.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIVE_REF = "auicerytbhnqeakmkscs";
const LOCAL_DB_CONTAINER = "supabase_db_agent-uncle-backoffice";
const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "schema-fingerprint.sql"), "utf8");

// Known, intentional differences. Everything else must match.
const EXPECTED = {
  // landing_leads was applied to live via the SQL endpoint, outside the migration history
  // (see supabase/README.md). Locally it is a normal migration.
  migrations: "live has the 6 app migrations; local adds 20261011230000_landing_leads",
};

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const file = join(homedir(), ".supabase", "access-token");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  let raw = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (raw.startsWith("go-keyring-base64:")) raw = Buffer.from(raw.slice(18), "base64").toString("utf8");
  return raw.trim();
}

async function live() {
  if (!/^\s*--[^\n]*\n|^\s*with\b/i.test(sql) || /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate)\s/i.test(sql.replace(/--[^\n]*/g, ""))) {
    throw new Error("fingerprint SQL must be a single read-only SELECT");
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${LIVE_REF}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`live query failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  return JSON.parse(JSON.parse(body)[0].fingerprint);
}

function local() {
  const out = execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out.trim());
}

const stable = (v) =>
  Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function compareMap(name, l = {}, r = {}, problems) {
  const keys = [...new Set([...Object.keys(l ?? {}), ...Object.keys(r ?? {})])].sort();
  let matched = 0;
  for (const k of keys) {
    if (!(k in (r ?? {}))) problems.push(`${name}: ${k} only LOCAL`);
    else if (!(k in (l ?? {}))) problems.push(`${name}: ${k} only LIVE`);
    else if (!same(l[k], r[k])) {
      const fields = Object.keys({ ...l[k], ...r[k] }).filter((f) => !same(l[k]?.[f], r[k]?.[f]));
      problems.push(`${name}: ${k} differs in [${fields.join(", ")}]`);
    } else matched++;
  }
  return { total: keys.length, matched };
}

const [L, R] = [local(), await live()];
const jsonDir = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
if (jsonDir) {
  mkdirSync(jsonDir, { recursive: true });
  writeFileSync(join(jsonDir, "fingerprint-local.json"), JSON.stringify(stable(L), null, 2));
  writeFileSync(join(jsonDir, "fingerprint-live.json"), JSON.stringify(stable(R), null, 2));
}

const problems = [];
const summary = {
  server_version: `${L.server_version} local / ${R.server_version} live`,
  schemas: compareMap("schema", L.schemas, R.schemas, problems),
  tables: compareMap("table", L.tables, R.tables, problems),
  functions: compareMap("function", L.functions, R.functions, problems),
  policies: compareMap("policy", L.policies, R.policies, problems),
  buckets: compareMap("bucket", L.buckets, R.buckets, problems),
  event_triggers: compareMap("event trigger", L.event_triggers, R.event_triggers, problems),
};
if (L.server_version !== R.server_version) problems.push(`server_version: ${summary.server_version}`);
if (!same(L.realtime_publication, R.realtime_publication))
  problems.push(`realtime publication: local ${JSON.stringify(L.realtime_publication)} vs live ${JSON.stringify(R.realtime_publication)}`);

const liveMig = R.migrations ?? [];
const localMig = L.migrations ?? [];
const extraLocal = localMig.filter((m) => !liveMig.includes(m));
const missingLocal = liveMig.filter((m) => !localMig.includes(m));
const migrationsOk = missingLocal.length === 0 && same(extraLocal, ["20261011230000_landing_leads"]);
if (!migrationsOk) problems.push(`migrations: only live ${JSON.stringify(missingLocal)}, only local ${JSON.stringify(extraLocal)}`);

const extDiff = Object.keys({ ...L.extensions, ...R.extensions }).filter((k) => L.extensions?.[k] !== R.extensions?.[k]);

console.log("Schema check: LOCAL supabase-local vs LIVE", LIVE_REF, "(read-only)");
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(15)} ${typeof v === "string" ? v : `${v.matched}/${v.total} identical`}`);
console.log(`  realtime pub    ${JSON.stringify(R.realtime_publication)}`);
console.log(`  migrations      live ${liveMig.length}, local ${localMig.length}${migrationsOk ? ` (expected: ${EXPECTED.migrations})` : ""}`);
if (extDiff.length) console.log(`  extensions      info only, differ: ${extDiff.map((k) => `${k} ${L.extensions?.[k] ?? "-"}/${R.extensions?.[k] ?? "-"}`).join(", ")}`);
if (problems.length) {
  console.log("\nMISMATCHES:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log("\nOK: tables, columns, constraints, indexes, grants, RLS, triggers, functions (definition md5 + EXECUTE grants), policies, bucket, event triggers and realtime publication match.");
