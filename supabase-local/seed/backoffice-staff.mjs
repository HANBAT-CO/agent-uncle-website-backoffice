#!/usr/bin/env node
// Backoffice staff logins and sample staff activity for the LOCAL stack (API http://127.0.0.1:55321).
//
//   supabase-local/scripts/reset.sh                 # usual entry point (runs after seed/demo.mjs)
//   node supabase-local/seed/backoffice-staff.mjs   # idempotent: safe to run again on the same DB
//
// 1. Creates the missing auth users with the GoTrue admin API (LOCAL service-role key, confirmed email):
//      admin@agentuncle.local     agentuncle-admin-local      owner     대표
//      operator@agentuncle.local  agentuncle-operator-local   operator  운영 담당
//      viewer@agentuncle.local    agentuncle-viewer-local     viewer    조회 담당
//      spare@agentuncle.local     agentuncle-spare-local      auth user only, NOT staff (staff onboarding tests)
// 2. Upserts public.backoffice_admins through psql.sh (require_mfa false), the documented way to seed staff.
// 3. Signs in as the operator and the owner with the publishable key and writes sample activity through the
//    real backoffice_* RPCs: 2 request notes, 1 case, 2 lead statuses, 1 draft and 1 live notice for
//    소매업자, and feature_flags {"newRequest": true}. Fixed operation ids make reruns replay instead of
//    duplicating (the RPC returns the stored result).
// 4. Checks every login and that backoffice_verify_audit_chain() is ok as the owner.
//
// Requires the layer migration 20261013090000_backoffice_admin_layer.sql (applied by reset.sh).

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = resolve(HERE, "..");

const STAFF = [
  { key: "owner", email: "admin@agentuncle.local", password: "agentuncle-admin-local", role: "owner", displayName: "대표", fullName: "백오피스 관리자" },
  { key: "operator", email: "operator@agentuncle.local", password: "agentuncle-operator-local", role: "operator", displayName: "운영 담당", fullName: "운영 담당" },
  { key: "viewer", email: "viewer@agentuncle.local", password: "agentuncle-viewer-local", role: "viewer", displayName: "조회 담당", fullName: "조회 담당" },
  { key: "spare", email: "spare@agentuncle.local", password: "agentuncle-spare-local", role: null, displayName: "", fullName: "예비 계정" },
];

// ---------------------------------------------------------------- config + guards
function loadEnv() {
  const file = join(LOCAL_ROOT, ".env.seed.local");
  if (!existsSync(file)) throw new Error("supabase-local/.env.seed.local is missing. Run supabase-local/scripts/start.sh first.");
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}
const env = loadEnv();
const API = env.LOCAL_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321$/.test(API ?? "")) throw new Error(`refusing to seed ${API}: local stack only`);
for (const k of ["LOCAL_SUPABASE_PUBLISHABLE_KEY", "LOCAL_SUPABASE_SERVICE_ROLE_KEY"]) if (!env[k]) throw new Error(`.env.seed.local is missing ${k}`);
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(API, env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, clientOpts);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
function psql(sql) {
  return execFileSync(join(LOCAL_ROOT, "scripts", "psql.sh"), ["-At", "-q", "-f", "-"], { input: sql, encoding: "utf8" }).trim();
}

async function signIn(member) {
  const client = createClient(API, env.LOCAL_SUPABASE_PUBLISHABLE_KEY, clientOpts);
  const { error } = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  if (error) throw new Error(`sign-in ${member.email}: ${error.message}`);
  return client;
}

async function rpc(client, label, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`[${label}] ${fn} failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
  return data;
}

// ---------------------------------------------------------------- 1. auth users
async function ensureAuthUsers() {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`cannot reach local auth: ${error.message}`);
  const existing = new Set(data.users.map((u) => u.email?.toLowerCase()));
  const created = [];
  for (const m of STAFF) {
    if (existing.has(m.email)) continue;
    const { error: e } = await service.auth.admin.createUser({
      email: m.email,
      password: m.password,
      email_confirm: true,
      user_metadata: { full_name: m.fullName, name: m.fullName },
      // Same shape demo.mjs gives admin@; the backoffice itself ignores app_metadata (spec D3).
      app_metadata: m.key === "owner" ? { backoffice_role: "admin" } : {},
    });
    if (e) throw new Error(`createUser ${m.email}: ${e.message}`);
    created.push(m.email);
  }
  return created;
}

// ---------------------------------------------------------------- 2. staff rows
function upsertStaff() {
  const rows = STAFF.filter((m) => m.role).map((m) => `(${q(m.email)}, ${q(m.role)}, ${q(m.displayName)})`).join(",\n  ");
  const out = psql(`
insert into public.backoffice_admins (user_id, role, display_name, require_mfa)
select u.id, v.role, v.display_name, false
from (values
  ${rows}
) v(email, role, display_name)
join auth.users u on lower(u.email) = v.email
on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name,
  require_mfa = false, revoked_at = null, updated_at = now();
select count(*) from public.backoffice_admins b join auth.users u on u.id = b.user_id
where lower(u.email) in (${STAFF.filter((m) => m.role).map((m) => q(m.email)).join(", ")})
  and b.revoked_at is null and not b.require_mfa;
`);
  const active = Number(out.split("\n").pop());
  if (active !== 3) throw new Error(`expected 3 active staff rows after the upsert, found ${active}`);
}

// ---------------------------------------------------------------- 3. sample activity
const first = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

/** Targets of the seed's earlier writes on this DB (operation id -> target id), read through psql.sh. */
function previousTargets() {
  const out = psql(`select operation_id || '|' || coalesce(target_id, '') from public.backoffice_audit_log
where operation_id like 'staff-seed-%' order by id;`);
  return Object.fromEntries(out.split("\n").filter(Boolean).map((line) => line.split("|")));
}

async function sampleActivity({ operator, owner, viewer }, operatorId) {
  const done = [];
  const skipped = [];

  // A rerun must send the same payload under the same operation id, so the RPC replays instead of
  // writing again (a different payload would be refused). Targets written before are therefore reused
  // from the audit log; only a fresh DB picks them: requests by label in creation order, leads by age.
  const prev = previousTargets();
  const byLabel = async (label) =>
    first((await rpc(operator, "operator", "backoffice_list_requests", { p_labels: [label], p_sort: "created_asc", p_limit: 1 })).rows);
  const anyRequest = async () => first((await rpc(operator, "operator", "backoffice_list_requests", { p_sort: "created_asc", p_limit: 1 })).rows);
  const reused = (opId) => (prev[opId] ? { id: prev[opId], product: `${prev[opId].slice(0, 8)}, reused` } : null);
  const issueReq = reused("staff-seed-note-1") ?? (await byLabel("문제 확인 중")) ?? (await anyRequest());
  const recheckReq = reused("staff-seed-note-2") ?? (await byLabel("미송 재확인")) ?? (await byLabel("미송 대기")) ?? issueReq;
  const caseReq = reused("staff-seed-case-1") ?? issueReq;

  if (issueReq && recheckReq) {
    await rpc(operator, "operator", "backoffice_add_note", {
      p_target_type: "request",
      p_target_id: issueReq.id,
      p_body: "소매업자에게 받은 수량 차이 사진을 확인했어요. 사입삼촌 답변을 기다리는 중이에요.",
      p_operation_id: "staff-seed-note-1",
    });
    await rpc(operator, "operator", "backoffice_add_note", {
      p_target_type: "request",
      p_target_id: recheckReq.id,
      p_body: "도매처에 재입고 일정을 물어봤어요. 금요일 입고 예정이라고 해요.",
      p_operation_id: "staff-seed-note-2",
    });
    done.push(`2 notes (${issueReq.product}, ${recheckReq.product})`);
    await rpc(operator, "operator", "backoffice_open_case", {
      p_target_type: "request",
      p_target_id: caseReq.id,
      p_title: "수령 수량 차이 확인",
      p_severity: "high",
      p_assignee_id: operatorId,
      p_note: "양쪽 사진을 받은 뒤 정정 제안이 필요한지 판단해요.",
      p_operation_id: "staff-seed-case-1",
    });
    done.push(`1 case (${caseReq.product})`);
  } else {
    skipped.push("notes and case (no requests: run reset.sh for the demo data)");
  }

  // The two oldest real leads (creation order never changes, unlike their status). Listed as the viewer:
  // operator+ lead lists are audited reads, and the seed should only leave its writes in the log.
  const leads = (await rpc(viewer, "viewer", "backoffice_list_leads", { p_include_suspect: false, p_limit: 200 })).rows ?? [];
  const byAge = [...leads].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
  const oldest = [prev["staff-seed-lead-1"] ? { id: prev["staff-seed-lead-1"] } : byAge[0], prev["staff-seed-lead-2"] ? { id: prev["staff-seed-lead-2"] } : byAge[1]];
  if (oldest.every(Boolean) && oldest[0].id !== oldest[1].id) {
    await rpc(operator, "operator", "backoffice_set_lead_status", {
      p_lead_id: oldest[0].id,
      p_status: "contacted",
      p_assignee_id: operatorId,
      p_note: "전화로 가입 절차를 안내했어요.",
      p_operation_id: "staff-seed-lead-1",
    });
    await rpc(operator, "operator", "backoffice_set_lead_status", {
      p_lead_id: oldest[1].id,
      p_status: "qualified",
      p_assignee_id: operatorId,
      p_note: "",
      p_operation_id: "staff-seed-lead-2",
    });
    done.push("2 lead statuses (contacted, qualified)");
  } else {
    skipped.push("lead statuses (fewer than 2 landing leads)");
  }

  await rpc(operator, "operator", "backoffice_save_notice", {
    p_title: "추석 연휴 픽업 일정 안내",
    p_body: "연휴 기간에는 픽업과 전달이 하루 정도 늦어질 수 있어요. 자세한 일정은 사입삼촌과 채팅으로 확인해 주세요.",
    p_audience: "retailer",
    p_active: false,
    p_operation_id: "staff-seed-notice-draft",
  });
  await rpc(owner, "owner", "backoffice_save_notice", {
    p_title: "상품 사진을 함께 올려 주세요",
    p_body: "요청을 보낼 때 상품 사진을 함께 올리면 사입삼촌이 더 빠르고 정확하게 찾을 수 있어요.",
    p_audience: "retailer",
    p_severity: "info",
    p_active: true,
    p_operation_id: "staff-seed-notice-live",
  });
  done.push("2 notices for 소매업자 (1 draft, 1 live)");

  const flags = (await rpc(owner, "owner", "backoffice_list_config", {})).find((c) => c.key === "feature_flags");
  if (!flags) throw new Error("feature_flags config key is missing (is the backoffice layer applied?)");
  if (flags.value?.newRequest === true) {
    done.push("feature_flags newRequest already on");
  } else {
    await rpc(owner, "owner", "backoffice_set_config", {
      p_key: "feature_flags",
      p_value: { ...flags.value, newRequest: true },
      p_reason: "새 요청 화면 시범 운영을 시작해요.",
      p_version: flags.version,
      p_operation_id: `staff-seed-feature-flags-v${flags.version}`,
    });
    done.push('feature_flags {"newRequest": true}');
  }
  return { done, skipped };
}

// ---------------------------------------------------------------- main
async function main() {
  const created = await ensureAuthUsers();
  upsertStaff();

  const clients = {};
  for (const m of STAFF) clients[m.key] = await signIn(m);
  const who = {};
  for (const m of STAFF) who[m.key] = await rpc(clients[m.key], m.key, "backoffice_whoami", {});
  for (const m of STAFF.filter((s) => s.role)) {
    if (!who[m.key].ready || who[m.key].role !== m.role) throw new Error(`${m.email} is not a ready ${m.role}: ${JSON.stringify(who[m.key])}`);
  }
  if (who.spare.admin) console.warn("warning: spare@agentuncle.local is active staff (a staff test did not restore it)");

  const { done, skipped } = await sampleActivity(clients, who.operator.userId);
  const chain = await rpc(clients.owner, "owner", "backoffice_verify_audit_chain", {});
  if (!chain.ok) throw new Error(`audit chain broken at id ${chain.brokenAtId}`);

  console.log(`backoffice staff: ${created.length ? `created ${created.join(", ")}` : "auth users already present"}`);
  for (const m of STAFF) console.log(`  ${m.email.padEnd(27)} ${m.password.padEnd(26)} ${m.role ?? "not staff"}`);
  console.log(`sample activity: ${done.join("; ")}`);
  if (skipped.length) console.log(`skipped: ${skipped.join("; ")}`);
  console.log(`audit chain ok (${chain.checked} rows)`);
}

await main();
