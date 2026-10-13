#!/usr/bin/env node
// Captures the JSON every backoffice read RPC returns, per staff role, so the
// zod contracts in src/lib/admin/rpc/schemas.ts are tested against real data.
//
//   supabase-local/scripts/reset.sh && node scripts/admin/capture-rpc-fixtures.mjs
//
// LOCAL STACK ONLY. Signs in as the seeded viewer, operator and owner with the
// publishable key (never a privileged key) and writes
// src/lib/admin/rpc/__fixtures__/<rpc>[.<variant>].<role>.json.
//
// Side effects on the local stack: the audited reads append audit rows
// (account.view, attachment.view, conversation.view, lead.view_list,
// admin.lookup, export.requests), exactly like a staff member using the
// console. No business record is changed.
//
// Large arrays are cut to a few rows (the export to 25, transcripts to 40)
// so the fixtures stay reviewable. Text containing an em or en dash is
// rewritten to a hyphen, because scripts/qa/no-dash.mjs scans src/.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "src/lib/admin/rpc/__fixtures__");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const DEFAULT_URL = "http://127.0.0.1:55321";

const STAFF = {
  viewer: { email: "viewer@agentuncle.local", password: "agentuncle-viewer-local" },
  operator: { email: "operator@agentuncle.local", password: "agentuncle-operator-local" },
  owner: { email: "admin@agentuncle.local", password: "agentuncle-admin-local" },
};

function readDotenv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function localTarget() {
  const env = readDotenv(path.join(ROOT, ".env.development.local"));
  const url = process.env.BACKOFFICE_SUPABASE_URL ?? env.BACKOFFICE_SUPABASE_URL ?? DEFAULT_URL;
  const key = process.env.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY ?? env.BACKOFFICE_SUPABASE_PUBLISHABLE_KEY;
  if (!LOOPBACK.has(new URL(url).hostname)) throw new Error(`refusing a non-local Supabase URL: ${url}`);
  if (!key) throw new Error("BACKOFFICE_SUPABASE_PUBLISHABLE_KEY is missing (run supabase-local/scripts/write-env.mjs)");
  if (!key.startsWith("sb_publishable_")) throw new Error("only the publishable key may be used");
  return { url, key };
}

const DASH = new RegExp(`[${String.fromCodePoint(0x2014)}${String.fromCodePoint(0x2013)}]`, "gu");

function scrub(value) {
  if (typeof value === "string") return value.replace(DASH, "-");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  return value;
}

let written = 0;
function save(name, role, data) {
  const file = path.join(OUT, `${name}.${role}.json`);
  writeFileSync(file, `${JSON.stringify(scrub(data), null, 2)}\n`);
  written += 1;
}

async function signIn({ url, key }, { email, password }) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function rpc(client, fn, args = {}) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.code} ${error.message}`);
  return data;
}

function pick(rows, predicate) {
  return rows.find(predicate) ?? null;
}

async function main() {
  const target = localTarget();
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(OUT)) if (file.endsWith(".json")) rmSync(path.join(OUT, file));

  // Targets chosen once (as the owner) so every role reads the same records.
  const owner = await signIn(target, STAFF.owner);
  const allRequests = await rpc(owner, "backoffice_list_requests", { p_include_demo: true, p_limit: 200 });
  const requestRows = allRequests.rows;
  const requestTargets = {
    issue: pick(requestRows, (r) => r.ledger.openIssues > 0),
    proposal: pick(requestRows, (r) => r.proposalId),
    delivery: pick(requestRows, (r) => r.ledger.delivered > 0 && r.ledger.openIssues === 0 && !r.proposalId),
    pending: pick(requestRows, (r) => r.status === "pending"),
  };
  // Staff seed activity (backoffice-staff.mjs): a request with notes and a case.
  const noted = (await rpc(owner, "backoffice_list_audit", { p_action: "note", p_target_type: "request", p_limit: 1 })).rows[0];
  const cased = (await rpc(owner, "backoffice_list_audit", { p_action: "case.open", p_target_type: "request", p_limit: 1 })).rows[0];
  if (noted) requestTargets.noted = { id: noted.targetId };
  if (cased && cased.targetId !== noted?.targetId) requestTargets.cased = { id: cased.targetId };
  const productTerm = (requestRows.find((r) => r.product)?.product ?? "").split(/\s+/)[0];
  const leadFacets = (await rpc(owner, "backoffice_list_leads", { p_limit: 1 })).facets;
  const handledLeadStatus = Object.keys(leadFacets).find((status) => status !== "new") ?? null;
  const accounts = (await rpc(owner, "backoffice_list_accounts", { p_include_demo: true, p_limit: 200 })).rows;
  const accountTargets = {
    retailer: pick(accounts, (a) => a.role === "retailer" && a.verification !== "missing") ?? pick(accounts, (a) => a.role === "retailer"),
    uncle: pick(accounts, (a) => a.role === "uncle"),
  };
  const conversations = (await rpc(owner, "backoffice_list_conversations", { p_include_demo: true, p_limit: 50 })).rows;
  const pair = pick(conversations, (c) => c.userMessages > 0) ?? conversations[0] ?? null;
  const attachments = (await rpc(owner, "backoffice_list_records", { p_collection: "attachments", p_include_demo: true, p_limit: 50 })).rows;
  const attachment = attachments[0] ?? null;
  await owner.auth.signOut({ scope: "local" });

  const collections = ["connections", "deliveries", "receipts", "proposals", "issues", "events", "notices", "attachments", "signupProgress"];

  for (const role of /** @type {const} */ (["viewer", "operator", "owner"])) {
    const client = await signIn(target, STAFF[role]);
    const full = role !== "viewer";

    save("whoami", role, await rpc(client, "backoffice_whoami"));
    save("overview", role, await rpc(client, "backoffice_overview", { p_include_demo: true, p_days: 7 }));
    save("ledger_anomalies", role, await rpc(client, "backoffice_ledger_anomalies", { p_include_demo: true }));
    save("list_accounts", role, await rpc(client, "backoffice_list_accounts", { p_include_demo: true, p_limit: 12 }));
    for (const [variant, account] of Object.entries(accountTargets)) {
      if (account) save(`get_account.${variant}`, role, await rpc(client, "backoffice_get_account", { p_account_id: account.id }));
    }
    save("list_requests", role, await rpc(client, "backoffice_list_requests", { p_include_demo: true, p_limit: 12 }));
    save(
      "list_requests.backorder",
      role,
      await rpc(client, "backoffice_list_requests", { p_include_demo: true, p_attention: "backorder", p_sort: "recheck_asc", p_limit: 12 }),
    );
    for (const [variant, request] of Object.entries(requestTargets)) {
      if (request) save(`get_request.${variant}`, role, await rpc(client, "backoffice_get_request", { p_request_id: request.id }));
    }
    for (const collection of collections) {
      save(
        `list_records.${collection}`,
        role,
        await rpc(client, "backoffice_list_records", { p_collection: collection, p_include_demo: true, p_limit: 8 }),
      );
    }
    save("list_conversations", role, await rpc(client, "backoffice_list_conversations", { p_include_demo: true, p_limit: 10 }));
    save("search", role, await rpc(client, "backoffice_search", { p_query: "셀렉트", p_limit: 5 }));
    if (productTerm) save("search.request", role, await rpc(client, "backoffice_search", { p_query: productTerm, p_limit: 5 }));
    save("search.empty", role, await rpc(client, "backoffice_search", { p_query: "", p_limit: 5 }));
    save("list_leads", role, await rpc(client, "backoffice_list_leads", { p_include_suspect: true, p_limit: 12 }));
    if (handledLeadStatus) {
      save("list_leads.handled", role, await rpc(client, "backoffice_list_leads", { p_status: handledLeadStatus, p_limit: 12 }));
    }
    save("list_config", role, await rpc(client, "backoffice_list_config"));
    save("list_notices", role, await rpc(client, "backoffice_list_notices", { p_include_inactive: true }));
    save("list_admins", role, await rpc(client, "backoffice_list_admins"));

    if (full) {
      if (pair) {
        const conversation = await rpc(client, "backoffice_get_conversation", {
          p_account_a: pair.accountA.id,
          p_account_b: pair.accountB.id,
          p_reason: "계약 분쟁 확인 (fixture)",
          p_limit: 40,
        });
        save("get_conversation", role, conversation);
      }
      if (attachment) {
        save("attachment_access", role, await rpc(client, "backoffice_attachment_access", { p_attachment_id: attachment.id, p_reason: "첨부 확인 (fixture)" }));
      }
      save("list_audit", role, await rpc(client, "backoffice_list_audit", { p_limit: 12 }));
      save("list_operations", role, await rpc(client, "backoffice_list_operations", { p_limit: 12 }));
      const exported = await rpc(client, "backoffice_export", { p_kind: "requests", p_reason: "월간 정산 확인 (fixture)", p_include_demo: true });
      save("export.requests", role, { ...exported, rows: exported.rows.slice(0, 25) });
      const deliveries = await rpc(client, "backoffice_export", { p_kind: "deliveries", p_reason: "월간 정산 확인 (fixture)", p_include_demo: true });
      save("export.deliveries", role, { ...deliveries, rows: deliveries.rows.slice(0, 10) });
    }
    if (role === "owner") {
      save("lookup_user", role, await rpc(client, "backoffice_lookup_user", { p_email: "spare@agentuncle.local" }));
      save("verify_audit_chain", role, await rpc(client, "backoffice_verify_audit_chain"));
      for (const kind of ["accounts", "leads"]) {
        const result = await rpc(client, "backoffice_export", { p_kind: kind, p_reason: "월간 정산 확인 (fixture)", p_include_demo: true });
        save(`export.${kind}`, role, { ...result, rows: result.rows.slice(0, 10) });
      }
    }
    await client.auth.signOut({ scope: "local" });
  }

  console.log(`capture-rpc-fixtures: wrote ${written} fixtures to ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(`capture-rpc-fixtures: ${error.message}`);
  process.exit(1);
});
