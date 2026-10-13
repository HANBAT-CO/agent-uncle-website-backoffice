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
  migrations: "local has the live app migrations plus 20261011230000_landing_leads",
};

// The PROPOSED backoffice layer (supabase/backoffice/20261013090000_backoffice_admin_layer.sql) is applied
// locally but not on live yet. Its objects are a known pending delta: listed, never a mismatch, as long as
// they exist only locally. Once one also exists on live it is compared like everything else.
const PENDING_MIGRATION = "20261013090000_backoffice_admin_layer";
const PENDING = {
  tables: /^public\.(backoffice_[a-z_]+|app_remote_config|app_notices)$/,
  functions: /^public\.(backoffice_[a-z_]+|is_backoffice_admin|app_write_blocked|app_bootstrap_config)\(/,
  policies: /^storage\.objects\.(backoffice_attachment_read|app_attachment_write_guard)$/,
  // Added to the existing public.saip_records table.
  trigger: /^CREATE TRIGGER backoffice_guard_app_writes /,
  index: "saip_records_collection_updated",
};

/** Removes local-only pending objects from the LOCAL fingerprint (in place) and returns them. */
function splitPending(l, r) {
  const pending = { schema: [], tables: [], functions: [], trigger: [], policies: [], index: [], migration: [] };
  for (const kind of ["tables", "functions", "policies"]) {
    for (const key of Object.keys(l[kind] ?? {})) {
      if (PENDING[kind].test(key) && !(key in (r[kind] ?? {}))) {
        delete l[kind][key];
        pending[kind].push(key.replace(/^public\./, "").replace(/\(.*$/, ""));
      }
    }
  }
  const lt = l.tables?.["public.saip_records"];
  const rt = r.tables?.["public.saip_records"];
  if (lt && rt) {
    const liveTriggers = new Set(rt.triggers ?? []);
    lt.triggers = (lt.triggers ?? []).filter((t) => {
      const local = PENDING.trigger.test(t) && !liveTriggers.has(t);
      if (local) pending.trigger.push("backoffice_guard_app_writes on public.saip_records");
      return !local;
    });
    const liveIndexes = new Set((rt.indexes ?? []).map(([name]) => name));
    lt.indexes = (lt.indexes ?? []).filter(([name]) => {
      const local = name === PENDING.index && !liveIndexes.has(name);
      if (local) pending.index.push(`${name} on public.saip_records`);
      return !local;
    });
  }
  const liveMigrations = r.migrations ?? [];
  if ((l.migrations ?? []).includes(PENDING_MIGRATION) && !liveMigrations.includes(PENDING_MIGRATION)) {
    l.migrations = l.migrations.filter((m) => m !== PENDING_MIGRATION);
    pending.migration.push(PENDING_MIGRATION);
  }
  // backoffice_private is outside the fingerprint (public and saip_private only); report it when present.
  const hasSchema = execFileSync(
    "docker",
    ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1",
      "-c", "select exists (select 1 from pg_namespace where nspname = 'backoffice_private')"],
    { encoding: "utf8" },
  ).trim();
  if (hasSchema === "t") pending.schema.push("backoffice_private (local check only, outside the fingerprint)");
  return pending;
}

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

const pending = splitPending(L, R);
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
console.log(`  migrations      live ${liveMig.length}, local ${localMig.length}${pending.migration.length ? ` + ${pending.migration.length} pending` : ""}${migrationsOk ? ` (expected: ${EXPECTED.migrations})` : ""}`);
if (extDiff.length) console.log(`  extensions      info only, differ: ${extDiff.map((k) => `${k} ${L.extensions?.[k] ?? "-"}/${R.extensions?.[k] ?? "-"}`).join(", ")}`);
const pendingKinds = Object.entries(pending).filter(([, names]) => names.length);
if (pendingKinds.length) {
  const n = pendingKinds.reduce((s, [, names]) => s + names.length, 0);
  console.log(`\npending, not on live (proposed backoffice layer ${PENDING_MIGRATION}, local only): ${n} objects`);
  for (const [kind, names] of pendingKinds) {
    const lines = [];
    for (const name of [...names].sort()) {
      if (lines.length && lines[lines.length - 1].length + name.length > 96) lines[lines.length - 1] += ",";
      if (!lines.length || lines[lines.length - 1].endsWith(",")) lines.push(name);
      else lines[lines.length - 1] += `, ${name}`;
    }
    lines.forEach((line, i) => console.log(`  ${(i ? "" : `${kind} (${names.length})`).padEnd(15)} ${line}`));
  }
}
if (problems.length) {
  console.log("\nMISMATCHES:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log(`\nOK: tables, columns, constraints, indexes, grants, RLS, triggers, functions (definition md5 + EXECUTE grants), policies, bucket, event triggers and realtime publication match${pendingKinds.length ? " (apart from the pending layer above)" : ""}.`);
