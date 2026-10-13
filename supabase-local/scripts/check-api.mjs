#!/usr/bin/env node
// Post-seed checks against the LOCAL stack through the real public API (publishable key + user JWTs).
//   node supabase-local/scripts/check-api.mjs
// Uses only the publishable key; the service-role key is not needed here.
// Expects reset.sh data: the demo seed, the backoffice layer and the staff seed (backoffice-staff.mjs).

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "..", ".env.seed.local");
const env = existsSync(envFile)
  ? Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
  : (() => {
      const s = JSON.parse(execFileSync(join(here, "sb.sh"), ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      return { LOCAL_SUPABASE_URL: s.API_URL, LOCAL_SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY };
    })();
const API = env.LOCAL_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321$/.test(API)) throw new Error(`local stack only, got ${API}`);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(API, env.LOCAL_SUPABASE_PUBLISHABLE_KEY, opts);
let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));

// 1. Local admin login
const admin = client();
const a = await admin.auth.signInWithPassword({ email: "admin@agentuncle.local", password: "agentuncle-admin-local" });
check(!a.error, "admin@agentuncle.local signs in with email + password", a.error?.message);
if (!a.error) {
  const c = claims(a.data.session.access_token);
  check(c.app_metadata?.backoffice_role === "admin", "admin JWT carries app_metadata.backoffice_role = admin", JSON.stringify(c.app_metadata));
  const { data } = await admin.from("saip_records").select("id").limit(1);
  check(Array.isArray(data) && data.length === 0, "admin JWT alone reads no saip_records (RLS: readers only)", "backoffice needs a server-side path");
  const cmd = await admin.rpc("saip_command", { command: "act", args: {}, operation_id: "check-admin" });
  check(Boolean(cmd.error), "admin has no app account, so saip_command rejects it", cmd.error?.message);
}

// 2. A demo retailer through the app's read path
const r = client();
const rs = await r.auth.signInWithPassword({ email: "mangwon.select@demo.agentuncle.local", password: "agentuncle-demo-local" });
check(!rs.error, "demo retailer 망원 셀렉트샵 signs in", rs.error?.message);
const snap = await r.rpc("saip_snapshot");
check(!snap.error && Object.keys(snap.data?.requests ?? {}).length > 0, "saip_snapshot returns the retailer's requests", `${Object.keys(snap.data?.requests ?? {}).length} requests`);
const partner = Object.entries(snap.data?.accounts ?? {}).find(([id, p]) => id !== rs.data.user.id && p.role === "uncle");
check(Boolean(partner) && !("businessNumber" in partner[1]), "partner profile is the public projection (no businessNumber)", partner?.[1]?.name);

// 3. Private storage: a partner may read a request photo, a stranger may not
const withPhoto = Object.values(snap.data?.requests ?? {}).find((q) => (q.photos ?? []).length);
if (withPhoto) {
  const u = client();
  const uncleEmail = { "동대문 박삼촌": "dm.park", "청평화 한삼촌": "cph.han" }[snap.data.accounts[withPhoto.uncleId]?.name];
  if (uncleEmail) {
    await u.auth.signInWithPassword({ email: `${uncleEmail}@demo.agentuncle.local`, password: "agentuncle-demo-local" });
    const path = await u.rpc("saip_attachment_path", { attachment_id: withPhoto.photos[0] });
    const file = path.error ? null : await u.storage.from("saip-attachments").download(path.data);
    check(Boolean(file?.data) && file.data.size > 0, "partner 사입삼촌 downloads the request photo", file?.data ? `${file.data.size} bytes` : path.error?.message);
  }
  const stranger = client();
  await stranger.auth.signInWithPassword({ email: "jamsil.today@demo.agentuncle.local", password: "agentuncle-demo-local" });
  const sp = await stranger.rpc("saip_attachment_path", { attachment_id: withPhoto.photos[0] });
  check(Boolean(sp.error), "an unrelated retailer cannot resolve that photo", sp.error?.message);
}

// 4. landing_leads stays insert-only for the public key
const anon = client();
const leads = await anon.from("landing_leads").select("id").limit(1);
check(Boolean(leads.error), "publishable key cannot read landing_leads", leads.error?.code);

// 5. Backoffice layer (proposed migration 20261013090000, staff from seed/backoffice-staff.mjs)
const whoOwner = a.error ? null : await admin.rpc("backoffice_whoami");
check(whoOwner?.data?.ready === true && whoOwner.data.role === "owner", "owner admin@ backoffice_whoami is ready", whoOwner?.error?.message ?? JSON.stringify({ role: whoOwner?.data?.role, ready: whoOwner?.data?.ready }));
for (const [email, password, role] of [
  ["operator@agentuncle.local", "agentuncle-operator-local", "operator"],
  ["viewer@agentuncle.local", "agentuncle-viewer-local", "viewer"],
  ["spare@agentuncle.local", "agentuncle-spare-local", null],
]) {
  const s = client();
  const login = await s.auth.signInWithPassword({ email, password });
  const who = login.error ? null : await s.rpc("backoffice_whoami");
  const ok = role ? who?.data?.ready === true && who.data.role === role : who?.data?.admin === false;
  check(!login.error && ok, `${email} signs in${role ? ` as a ready ${role}` : " and is not staff"}`, login.error?.message ?? who?.error?.message);
}
const chain = a.error ? null : await admin.rpc("backoffice_verify_audit_chain");
check(chain?.data?.ok === true, "owner verifies the audit chain", chain?.error?.message ?? `${chain?.data?.checked} rows`);
const appUser = await r.rpc("backoffice_overview");
check(appUser.status === 403, "demo app user gets HTTP 403 from rpc/backoffice_overview", `HTTP ${appUser.status}`);
const anonOverview = await anon.rpc("backoffice_overview");
check([401, 403].includes(anonOverview.status), "anon gets HTTP 401 or 403 from rpc/backoffice_overview", `HTTP ${anonOverview.status}`);
const boot = await anon.rpc("app_bootstrap_config", { p_platform: "ios", p_app_version: "0.1.0" });
check(boot.status === 200 && typeof boot.data?.maintenance?.active === "boolean", "anon rpc/app_bootstrap_config returns 200 with maintenance", `HTTP ${boot.status}`);
const auditRead = a.error ? null : await admin.from("backoffice_audit_log").select("*").limit(1);
check([401, 403, 404].includes(auditRead?.status), "owner cannot select backoffice_audit_log through REST (no table access)", `HTTP ${auditRead?.status} ${auditRead?.error?.code ?? ""}`.trim());

// 6. Sample staff activity from seed/backoffice-staff.mjs (backoffice_list_audit is an unaudited read)
const audit = a.error ? null : await admin.rpc("backoffice_list_audit", { p_limit: 200 });
const actions = (audit?.data?.rows ?? []).map((row) => row.action);
const count = (action) => actions.filter((x) => x === action).length;
const seeded = { "note.add": 2, "case.open": 1, "lead.set_status": 2, "notice.create": 2, "config.set": 1 };
check(Object.entries(seeded).every(([action, n]) => count(action) >= n), "staff seed activity is in the audit log",
  Object.entries(seeded).map(([action]) => `${action} ${count(action)}`).join(", ") || audit?.error?.message);
check(boot.data?.config?.feature_flags?.newRequest === true, "app_bootstrap_config carries feature_flags.newRequest = true", JSON.stringify(boot.data?.config?.feature_flags));
const retailerBoot = await r.rpc("app_bootstrap_config", { p_platform: "ios", p_app_version: "0.1.0" });
const liveNotices = (retailerBoot.data?.notices ?? []).map((n) => n.title);
check(liveNotices.includes("상품 사진을 함께 올려 주세요") && !liveNotices.includes("추석 연휴 픽업 일정 안내"),
  "a retailer's app_bootstrap_config shows the live notice and not the draft", JSON.stringify(liveNotices));

console.log(failed ? `\n${failed} check(s) failed` : "\nall API checks passed");
process.exit(failed ? 1 : 0);
