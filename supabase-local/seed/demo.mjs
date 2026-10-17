#!/usr/bin/env node
// Demo data for the LOCAL backoffice stack (supabase-local, API http://127.0.0.1:55321).
//
//   supabase-local/scripts/reset.sh          # usual entry point: db reset + platform parity + this file
//   node supabase-local/seed/demo.mjs        # on an empty, freshly reset local DB only
//
// What it does
// 1. Creates demo auth users (Admin API, LOCAL service-role key) and the local admin login.
// 2. Every business record is written through the real `saip_command` RPC, signed in as the
//    user who would do it in the app (retailer or 사입삼촌), with real Storage uploads for
//    business documents and photos. The SQL invariants (수령 ≤ 전달 ≤ 확보, versions, roles,
//    held stock, proposal/issue rules) therefore hold exactly as in production.
// 3. Steps run in simulated chronological order (signups ~8 weeks ago → today). Afterwards one
//    LOCAL SQL pass maps each operation's real timestamp onto its simulated time (createdAt,
//    updatedAt, auth.users.created_at, landing_leads.created_at, ...). Only timestamps move;
//    no business field is touched outside the RPC.
// 4. Inserts landing_leads with the publishable key, exactly like the landing's server action.
//
// Safety: refuses any URL other than the local stack and any non-empty database.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = resolve(HERE, "..");
const DB_CONTAINER = "supabase_db_agent-uncle-backoffice";

export const DEMO_PASSWORD = "agentuncle-demo-local";
export const ADMIN = { email: "admin@agentuncle.local", password: "agentuncle-admin-local", name: "백오피스 관리자" };

// ---------------------------------------------------------------- config + guards
function loadEnv() {
  const file = join(LOCAL_ROOT, ".env.seed.local");
  if (existsSync(file)) {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
  }
  const s = JSON.parse(
    execFileSync(join(LOCAL_ROOT, "scripts", "sb.sh"), ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  return { LOCAL_SUPABASE_URL: s.API_URL, LOCAL_SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY, LOCAL_SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY };
}
const env = loadEnv();
const API = env.LOCAL_SUPABASE_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):55321$/.test(API ?? "")) throw new Error(`refusing to seed ${API}: local stack only`);
const PUBLISHABLE = env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(API, SERVICE, clientOpts);
const anon = createClient(API, PUBLISHABLE, clientOpts);

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------- deterministic randomness + time
let rngState = 20261013;
function rand() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const NOW = Date.now();
const KST = 9 * 3600e3;
const kstParts = () => {
  const k = new Date(NOW + KST);
  return [k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()];
};
/** KST wall-clock time `daysAgo` days before today (hh may exceed 23 to roll into the next day). */
const T = (daysAgo, hh, mm = 0) => {
  const [y, m, d] = kstParts();
  return Date.UTC(y, m, d - daysAgo, hh, mm) - KST;
};
const hoursAgo = (h) => NOW - h * 3600e3;
/** 'YYYY-MM-DD' in KST; negative daysAgo = future (recheck dates). */
const kstDate = (daysAgo) => new Date(T(daysAgo, 12)).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// ---------------------------------------------------------------- timeline
const steps = [];
let stepSeq = 0;
/** Register a scenario: `build(at, s)` adds steps; steps of one scenario keep their order. */
function scenario(name, build) {
  const local = [];
  const s = { name, deliveries: [], issues: [], proposals: [] };
  build((time, fn) => local.push({ time: +time, fn }), s);
  for (let i = 1; i < local.length; i++) if (local[i].time <= local[i - 1].time) local[i].time = local[i - 1].time + 7 * 60e3;
  // Never simulate the future: slide the whole scenario back if its last step would be too recent.
  const limit = NOW - 4 * 60e3;
  const over = local.length ? local[local.length - 1].time - limit : 0;
  if (over > 0) for (const st of local) st.time -= over + 60e3;
  for (const st of local) steps.push({ ...st, seq: stepSeq++, name });
}
let simCursor = 0;
/** Simulated time for the next command; reading notices/chats takes seconds, real work a minute or so. */
const tick = (quick = false) => {
  const t = simCursor;
  simCursor += quick ? 1e3 + Math.floor(rand() * 3e3) : 15e3 + Math.floor(rand() * 60e3);
  return t;
};
const QUICK = new Set(["readNotice", "markChatRead", "refreshReminders", "saveDraft"]);

// ---------------------------------------------------------------- RPC plumbing (always as the acting user)
const plan = []; // [operation_id, simulated ISO time]
let opSeq = 0;
async function cmd(user, command, args = {}, opId) {
  const id = opId ?? `seed-${String(++opSeq).padStart(5, "0")}`;
  const sim = tick(QUICK.has(command));
  const { data, error } = await user.client.rpc("saip_command", { command, args, operation_id: id });
  if (error) throw new Error(`[${user.label}] ${command} failed: ${error.message}\n  args=${JSON.stringify(args).slice(0, 400)}`);
  plan.push([id, new Date(sim).toISOString()]);
  return data;
}
async function rec(user, collection, id) {
  const { data, error } = await user.client.from("saip_records").select("data").eq("collection", collection).eq("id", id).single();
  if (error) throw new Error(`[${user.label}] read ${collection}/${id}: ${error.message}`);
  return data.data;
}
async function rows(user, collection, filter = (q) => q) {
  const { data, error } = await filter(user.client.from("saip_records").select("id,data").eq("collection", collection));
  if (error) throw new Error(`[${user.label}] list ${collection}: ${error.message}`);
  return data;
}
const version = async (user, collection, id) => (await rec(user, collection, id)).version ?? 0;

// ---------------------------------------------------------------- files (generated, no real data)
const SHAPES = {
  top: '<path d="M168 92 L214 74 Q240 104 266 74 L312 92 L392 152 L360 210 L322 190 L322 404 L158 404 L158 190 L120 210 L88 152 Z"/>',
  outer: '<path d="M164 80 L216 68 L240 120 L264 68 L316 80 L392 150 L366 214 L330 196 L334 420 L146 420 L150 196 L114 214 L88 150 Z"/><path d="M240 120 L240 420" fill="none"/>',
  vest: '<path d="M178 84 L216 72 Q240 112 264 72 L302 84 L334 150 L330 408 L150 408 L146 150 Z"/>',
  bottom: '<path d="M168 78 L312 78 L334 404 L264 404 L240 196 L216 404 L146 404 Z"/>',
  skirt: '<path d="M186 92 L294 92 L362 392 L118 392 Z"/>',
  dress: '<path d="M200 70 L280 70 L300 162 L364 404 L116 404 L180 162 Z"/>',
  bag: '<path d="M146 204 L334 204 L354 394 L126 394 Z"/><path d="M188 204 Q240 104 292 204" fill="none" stroke-width="10"/>',
  scarf: '<path d="M138 120 L342 120 L342 194 L262 194 L284 404 L222 404 L200 194 L138 194 Z"/>',
};
async function productPng(spec, variant = 0) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
<rect width="480" height="480" fill="${variant % 2 ? "#ECEAE3" : "#F5F3EE"}"/>
<g fill="${spec.color}" stroke="#1C1C1C" stroke-width="4" stroke-linejoin="round">${SHAPES[spec.shape] ?? SHAPES.top}</g>
<rect x="18" y="436" width="96" height="28" rx="6" fill="#1F6B4F"/><text x="66" y="456" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#FFFFFF">DEMO</text>
</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
function demoPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const content = ["BT", "/F1 18 Tf", "72 760 Td", ...lines.flatMap((l, i) => [i ? "0 -30 Td" : "", `(${esc(l)}) Tj`]).filter(Boolean), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
async function upload(user, bytes, mime, name) {
  const id = randomUUID();
  const { error } = await user.client.storage.from("saip-attachments").upload(`${user.id}/${id}`, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`[${user.label}] upload ${name}: ${error.message}`);
  await cmd(user, "registerAttachment", { id, name });
  return id;
}
const photo = async (user, spec, variant = 0) =>
  upload(user, await productPng(spec, variant), "image/png", `${spec.product.replace(/\s+/g, "_")}_${variant + 1}.png`);

// ---------------------------------------------------------------- people
const UNCLES = {
  park: { slug: "dm.park", provider: "kakao", contact: "동대문 박삼촌", phone: "010-2381-4402", pickupArea: "디오트 2층 · 청평화 1층", deliveryArea: "서울 마포·서대문·은평", deadline: "22:00", holiday: "일요일 휴무예요. 토요일 요청은 21시까지 받아요.", intro: "청평화·디오트 야간 사입 12년차예요. 사진 보내주시면 같은 상품으로 찾아드려요.", working: true, transport: "오토바이", activityHours: "야간 22–06", activityStart: "21:00", activityEnd: "06:00", activityDays: ["월", "화", "수", "목", "금", "토"] },
  kim: { slug: "ndm.kim", provider: "google", contact: "남대문 김삼촌", phone: "010-5520-1934", pickupArea: "남대문 대도상가 E동 · 삼익패션타운", deliveryArea: "서울 중구·용산·성동", deadline: "18:00", holiday: "일요일, 공휴일 휴무", intro: "남대문 아동복·잡화 전문이에요. 오전 픽업, 오후 전달해요.", working: true, transport: "승용차", activityHours: "주간 09–18", activityStart: "07:00", activityEnd: "17:00", activityDays: ["월", "화", "수", "목", "금", "토"] },
  lee: { slug: "jp.lee", provider: "kakao", contact: "제일평화 이삼촌", phone: "010-7731-0458", pickupArea: "제일평화시장 3층 · 신평화 2층", deliveryArea: "서울 강남·서초·송파", deadline: "23:00", holiday: "토요일 휴무", intro: "제일평화 여성복 위주로 다녀요. 대량 요청은 하루 전에 알려주세요.", working: true, transport: "화물차", activityHours: "야간 22–06", activityStart: "22:00", activityEnd: "05:00", activityDays: ["일", "월", "화", "수", "목", "금"] },
  choi: { slug: "apm.choi", provider: "google", contact: "APM 최삼촌", phone: "010-9012-6673", pickupArea: "APM 럭스 · 누존 지하 1층", deliveryArea: "경기 성남·용인·수원", deadline: "21:30", holiday: "", intro: "APM·누존 남녀 캐주얼 사입해요. 경기 남부 당일 전달 가능해요.", working: true, transport: "승용차", activityHours: "야간 22–06", activityStart: "21:00", activityEnd: "05:30", activityDays: ["월", "화", "수", "목", "금"] },
  jung: { slug: "gh.jung", provider: "kakao", contact: "광희시장 정삼촌", phone: "010-3345-8821", pickupArea: "광희시장 2층 가죽·잡화", deliveryArea: "서울 전 지역 · 퀵 연계", deadline: "20:00", holiday: "이번 주는 휴가예요. 급한 요청은 채팅 남겨 주세요.", intro: "가죽·잡화 전문. 샘플 사진 확인 후 진행해요.", working: false, transport: "도보", activityHours: "일정에 따라 달라요", activityStart: "", activityEnd: "", activityDays: ["화", "목", "토"] },
  han: { slug: "cph.han", provider: "google", contact: "청평화 한삼촌", phone: "010-6604-2297", pickupArea: "청평화시장 1~3층", deliveryArea: "인천·부천·김포·고양", deadline: "22:30", holiday: "일요일 휴무", intro: "청평화 전 층 다녀요. 인천·경기 서부 새벽 전달해요.", working: true, transport: "오토바이", activityHours: "일정에 따라 달라요", activityStart: "20:00", activityEnd: "04:00", activityDays: ["월", "화", "수", "목", "금", "토"] },
};
const RETAILERS = {
  mangwon: { slug: "mangwon.select", provider: "kakao", name: "망원 셀렉트샵", contact: "윤서진", phone: "010-4821-3307", businessName: "망원셀렉트", businessNumber: "214-87-36190", address: "서울 마포구 포은로 81", addressDetail: "1층 망원 셀렉트샵", deliveryNote: "오후 1시 이후 수령 가능해요. 문 앞 보관은 하지 말아 주세요.", salesChannel: "오프라인", markets: ["동대문"] },
  yeonnam: { slug: "yeonnam.daily", provider: "google", name: "연남 데일리룩", contact: "김하린", phone: "010-7714-2093", businessName: "데일리룩", businessNumber: "105-24-77831", address: "서울 마포구 동교로 233", addressDetail: "2층", deliveryNote: "건물 뒤편 계단으로 올라와 주세요.", salesChannel: "온라인·오프라인 병행", markets: ["동대문", "남대문"] },
  seongsu: { slug: "seongsu.mood", provider: "kakao", name: "성수 무드옷장", contact: "박도윤", phone: "010-3392-1186", businessName: "무드옷장", businessNumber: "206-11-90452", address: "서울 성동구 연무장길 41", addressDetail: "지하 1층", deliveryNote: "", salesChannel: "온라인", markets: ["동대문"] },
  hapjeong: { slug: "hapjeong.vintage", provider: "google", name: "합정 빈티지랩", contact: "이수아", phone: "010-9123-5540", businessName: "빈티지랩", businessNumber: "313-02-41875", address: "서울 마포구 양화로 45", addressDetail: "3층 302호", deliveryNote: "엘리베이터 없어요.", salesChannel: "오프라인", markets: ["동대문", "광희시장"], docAsPng: true },
  hannam: { slug: "hannam.soy", provider: "kakao", name: "한남 아틀리에 소이", contact: "최지안", phone: "010-2258-6671", businessName: "아틀리에소이", businessNumber: "211-35-08816", address: "서울 용산구 이태원로 245", addressDetail: "1층", deliveryNote: "월요일 휴무예요.", salesChannel: "오프라인", markets: ["남대문"] },
  gangnam: { slug: "gangnam.lian", provider: "google", name: "강남 스타일숍 리안", contact: "정예린", phone: "010-6630-8812", businessName: "스타일숍리안", businessNumber: "120-86-55203", address: "서울 강남구 압구정로 164", addressDetail: "2층", deliveryNote: "", salesChannel: "온라인·오프라인 병행", markets: ["동대문"] },
  jamsil: { slug: "jamsil.today", provider: "kakao", name: "잠실 오늘의옷", contact: "한지호", phone: "010-5047-2290", businessName: "오늘의옷", businessNumber: "215-19-63327", address: "서울 송파구 올림픽로 300", addressDetail: "지하 1층 팝업 스토어", deliveryNote: "하역장 B3 이용해 주세요.", salesChannel: "오프라인", markets: ["동대문"] },
  bundang: { slug: "bundang.daisy", provider: "google", name: "분당 데이지룸", contact: "오민지", phone: "031-712-4480", businessName: "데이지룸", businessNumber: "129-28-91734", address: "경기 성남시 분당구 정자일로 95", addressDetail: "1층 102호", deliveryNote: "", salesChannel: "온라인", markets: ["동대문"] },
  suwon: { slug: "suwon.knit", provider: "kakao", name: "수원 행궁 니트하우스", contact: "서유진", phone: "010-3381-0927", businessName: "니트하우스", businessNumber: "124-41-20586", address: "경기 수원시 팔달구 신풍로 42", addressDetail: "1층", deliveryNote: "가게 옆 창고에 놓아 주세요.", salesChannel: "오프라인", markets: ["동대문"] },
  bupyeong: { slug: "bupyeong.closet", provider: "google", name: "부평 걸즈클로젯", contact: "임나연", phone: "010-8820-1135", businessName: "걸즈클로젯", businessNumber: "122-07-48812", address: "인천 부평구 부평대로 37", addressDetail: "지하상가 B-112", deliveryNote: "지하상가 10시 오픈이에요.", salesChannel: "오프라인", markets: ["동대문", "남대문"], docAsPng: true },
  fitmood: { slug: "fitandmood", provider: "kakao", name: "온라인몰 핏앤무드", contact: "강민준", phone: "010-4412-7789", businessName: "핏앤무드", businessNumber: "110-81-37460", address: "서울 은평구 통일로 684", addressDetail: "물류센터 4층", deliveryNote: "물류센터 입고 마감은 17시예요.", salesChannel: "온라인", markets: ["동대문"] },
  ilsan: { slug: "ilsan.mono", provider: "google", name: "일산 라페 모노", contact: "고은비", phone: "010-2710-5563", businessName: "라페모노", businessNumber: "128-37-60145", address: "경기 고양시 일산동구 정발산로 24", addressDetail: "라페스타 A동 1층", deliveryNote: "", salesChannel: "온라인·오프라인 병행", markets: ["동대문"] },
};
const INCOMPLETE = [
  { slug: "new.kakao.user", provider: "kakao", fullName: "김지우" },
  { slug: "euljiro.props", provider: "google", fullName: "문가은" },
];

const users = {};
async function createAuthUser(key, email, fullName, provider, password = DEMO_PASSWORD, appMeta = {}) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, name: fullName },
    app_metadata: { provider, ...appMeta },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const client = createClient(API, PUBLISHABLE, clientOpts);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`signIn ${email}: ${e2.message}`);
  users[key] = { key, id: data.user.id, email, label: fullName, client };
  return users[key];
}
const R = {};
const U = {};

// ---------------------------------------------------------------- business helpers
async function signup(user, role, profile) {
  await cmd(user, "bootstrap", {}, `bootstrap-${user.id}`);
  await cmd(user, "chooseRole", { role });
  let documentId = "";
  if (role === "retailer") {
    documentId = profile.docAsPng
      ? await upload(user, await productPng({ shape: "scarf", color: "#E9E4D6" }, 1), "image/png", "사업자등록증.png")
      : await upload(user, demoPdf(["DEMO ONLY - sample business registration", `No. ${profile.businessNumber}`, `Account: ${user.email}`]), "application/pdf", "사업자등록증.pdf");
  }
  // Seed-only keys (slug, provider, docAsPng) are not profile fields.
  const fields = Object.fromEntries(Object.entries(profile).filter(([k]) => !["slug", "provider", "docAsPng"].includes(k)));
  const values = { ...fields, bankName: "로컬 테스트 은행", bankAccount: "000123456789", bankHolder: profile.contact || profile.name, terms: true, privacy: true, documentId, photoId: "" };
  if (role === "uncle") values.name = profile.contact; // the app always sends name = 담당자명 for 사입삼촌
  if (role === "retailer") Object.assign(values, { pickupArea: "", deliveryArea: "", deadline: "" });
  values.notificationSettings = rand() < 0.25 ? { connection: true, request: true, delivery: true, chat: false } : {};
  await cmd(user, "saveProfile", { complete: true, values });
  user.p = profile;
  user.role = role;
}
async function connect(from, to) {
  const code = (await rec(to, "accounts", to.id)).code;
  const { error } = await from.client.rpc("saip_lookup_code", { code });
  if (error) throw new Error(`[${from.label}] lookup: ${error.message}`);
  return cmd(from, "connect", { peerId: to.id, code });
}
async function respondConnection(user, id, status) {
  await cmd(user, "respondConnection", { id, status, version: await version(user, "connections", id) });
}
async function send(s, r, u, spec, { photos = rand() < 0.75 ? 1 : 0, note } = {}) {
  const id = randomUUID();
  const ids = [];
  for (let i = 0; i < photos; i++) ids.push(await photo(r, spec, i));
  const values = {
    uncleId: u.id,
    wholesaler: spec.wholesaler,
    location: spec.location,
    product: spec.product,
    option: spec.option,
    quantity: spec.quantity,
    address: r.p.address,
    addressDetail: r.p.addressDetail,
    note: note ?? r.p.deliveryNote ?? "",
    photos: ids,
  };
  await cmd(r, "saveDraft", { id, values });
  await cmd(r, "sendDraft", { id });
  Object.assign(s, { id, r, u, spec });
}
async function act(user, s, action, values = {}) {
  await cmd(user, "act", { id: s.id, action, values, version: await version(user, "requests", s.id) });
}
const accept = (s) => act(s.u, s, "accept");
const reject = (s, reason) => act(s.u, s, "reject", { reason });
const cancelPending = (s) => act(s.r, s, "cancel");
const wait = (s) => act(s.r, s, "wait");
async function result(s, acquired, { recheck = "", reason = "", needsReply = false } = {}) {
  const r = await rec(s.u, "requests", s.id);
  const backorder = r.quantity - (r.cancelled ?? 0) - acquired + (r.acquiredCancelled ?? 0);
  await act(s.u, s, "result", { acquired, backorder, recheck: backorder > 0 ? recheck : "", reason, needsReply: backorder > 0 && needsReply });
}
/** One 전달 record for one or more requests of the same retailer + address. */
async function deliver(list) {
  const u = list[0][0].u;
  const quantities = {};
  const versions = {};
  const before = {};
  for (const [s, q] of list) {
    quantities[s.id] = q;
    versions[s.id] = await version(u, "requests", s.id);
    before[s.id] = new Set((await rows(u, "deliveries", (q2) => q2.eq("data->>requestId", s.id))).map((d) => d.id));
  }
  await cmd(u, "deliver", { quantities, versions });
  for (const [s] of list) {
    const now = await rows(u, "deliveries", (q2) => q2.eq("data->>requestId", s.id));
    s.deliveries.push(...now.filter((d) => !before[s.id].has(d.id)).map((d) => d.id));
  }
}
async function receive(s, index, actual, reason = "") {
  const id = s.deliveries[index];
  await cmd(s.r, "receive", { id, actual, reason, version: await version(s.r, "deliveries", id) });
}
// Same shape the app's proposal form sends (requests.dart): counts, uncleId, photos, plus overrides.
const proposalValues = (r, extra) => ({
  quantity: r.quantity,
  acquired: r.acquired ?? 0,
  received: r.received ?? 0,
  acquiredCancelled: 0,
  uncleId: r.uncleId,
  photos: r.photos ?? [],
  ...extra,
});
async function propose(s, actor, kind, extra) {
  const r = await rec(actor, "requests", s.id);
  const base = kind === "change" ? { wholesaler: r.wholesaler, location: r.location, product: r.product, option: r.option, address: r.address, addressDetail: r.addressDetail, note: r.note ?? "" } : {};
  const pid = await cmd(actor, "propose", { id: s.id, kind, values: proposalValues(r, { ...base, ...extra }), version: r.version });
  s.proposals.push(pid);
  return pid;
}
async function respondProposal(s, actor, approve) {
  const pid = s.proposals[s.proposals.length - 1];
  await cmd(actor, "respondProposal", { id: pid, approve, version: await version(actor, "proposals", pid) });
}
async function trackIssue(s, fn) {
  const before = new Set((await rows(s.r, "issues", (q) => q.eq("data->>requestId", s.id))).map((i) => i.id));
  await fn();
  const after = await rows(s.r, "issues", (q) => q.eq("data->>requestId", s.id));
  s.issues.push(...after.filter((i) => !before.has(i.id)).map((i) => i.id));
}
const receiveWithDiff = (s, index, actual, reason) => trackIssue(s, () => receive(s, index, actual, reason));
async function reportIssue(s, values) {
  await trackIssue(s, async () =>
    cmd(s.r, "reportIssue", { id: s.id, values: { deliveryId: "", held: 0, ...values }, version: await version(s.r, "requests", s.id) }),
  );
}
async function issueAct(s, actor, action, note = "") {
  const id = s.issues[s.issues.length - 1];
  await cmd(actor, "actOnIssue", { id, action, note, version: await version(actor, "issues", id) });
}
async function chat(sender, peer, body, { s, photoSpec } = {}) {
  const id = randomUUID();
  const attachments = photoSpec ? [await photo(sender, photoSpec, 1)] : [];
  await cmd(sender, "sendMessage", { id, peerId: peer.id, body, attachments, requestId: s?.id ?? "" }, id);
  return id;
}
// The app's message menu (202610130000): the sender edits or deletes a sent message.
const editMessage = async (sender, id, body) => cmd(sender, "editMessage", { id, body, version: await version(sender, "messages", id) });
const deleteMessage = async (sender, id) => cmd(sender, "deleteMessage", { id, version: await version(sender, "messages", id) });
/** 도매처 주문서 (requestType 'wholesaler', 202610130004): 1-10 wholesalers, 수령지 from the retailer profile. */
async function sendWholesalers(s, r, u, wholesalers) {
  const id = randomUUID();
  await cmd(r, "saveDraft", { id, values: { uncleId: u.id, requestType: "wholesaler", wholesalers } });
  await cmd(r, "sendDraft", { id });
  Object.assign(s, { id, r, u, spec: { product: wholesalers[0].wholesaler, shape: "bag", color: "#C9B79C" } });
}
const say = (s, who, body, opts = {}) => chat(who === "r" ? s.r : s.u, who === "r" ? s.u : s.r, body, { s, ...opts });
async function readAll(user) {
  const notices = await rows(user, "notices", (q) => q.eq("data->>ownerId", user.id).eq("data->>read", "false"));
  for (const n of notices) await cmd(user, "readNotice", { id: n.id });
  const unread = await rows(user, "messages", (q) => q.eq("data->>recipientId", user.id).eq("data->>read", "false").eq("data->>status", "sent"));
  for (const peerId of new Set(unread.map((m) => m.data.senderId))) await cmd(user, "markChatRead", { peerId });
}

// ---------------------------------------------------------------- catalogue
const item = (wholesaler, location, product, option, shape, color) => (quantity) => ({ wholesaler, location, product, option, quantity, shape, color });
const P = {
  oxford: item("모노스튜디오", "디오트 2층 B-12", "오버핏 옥스포드 셔츠", "블루 / FREE", "top", "#6E8FC0"),
  cardigan: item("한올니트", "청평화 1층 가-31", "케이블 니트 가디건", "아이보리 / FREE", "outer", "#EFE7D6"),
  slacks: item("라인바이", "제일평화 3층 305호", "핀턱 와이드 슬랙스", "차콜 / L", "bottom", "#3E4045"),
  tweed: item("메종루", "신평화 2층 72호", "크롭 트위드 자켓", "블랙 / S", "outer", "#262626"),
  hoodie: item("데이핏", "디오트 3층 C-07", "기모 후드 집업", "멜란지 그레이 / XL", "outer", "#B7B7B7"),
  sweat: item("데이핏", "디오트 3층 C-07", "하프넥 맨투맨", "차콜 / FREE", "top", "#45464B"),
  trench: item("블랑쉬", "남대문 대도상가 E동 2층 18호", "더블 트렌치 코트", "베이지 / M", "outer", "#CDB892"),
  woolcoat: item("코지룸", "APM 럭스 5층 513호", "울 블렌드 싱글 코트", "카멜 / 55", "outer", "#B07F55"),
  turtleneck: item("소소상회", "누존 지하 1층 23호", "골지 터틀넥 니트", "그레이 / FREE", "top", "#9C9C9C"),
  minibag: item("더스트", "광희시장 2층 214호", "레더 미니 숄더백", "블랙 / ONE", "bag", "#1E1E1E"),
  padvest: item("누보", "청평화 2층 나-14", "경량 패딩 베스트", "블랙 / FREE", "vest", "#2A2A2A"),
  pleats: item("아뜰리에 봄", "제일평화 2층 211호", "플리츠 롱스커트", "베이지 / FREE", "skirt", "#D8C3A5"),
  denim: item("제이원", "디오트 1층 A-05", "부츠컷 데님 팬츠", "흑청 / 27", "bottom", "#2B3446"),
  stripe: item("써니앤코", "청평화 3층 다-02", "스트라이프 니트 티", "네이비 / FREE", "top", "#28344F"),
  corduroy: item("빈센트", "신평화 1층 15호", "코듀로이 셔츠 자켓", "브라운 / M", "outer", "#7A5235"),
  muffler: item("한올니트", "청평화 1층 가-31", "캐시미어 블렌드 머플러", "오트밀 / ONE", "scarf", "#D9CCB4"),
  velvet: item("미드나잇", "APM 럭스 3층 302호", "벨벳 롱 원피스", "와인 / FREE", "dress", "#6E2235"),
  kidsset: item("꼬마숲", "남대문 삼익패션타운 3층 B-7", "아동 기모 트레이닝 세트", "핑크 / 110", "top", "#E6A8B8"),
  wideDenim: item("제이원", "디오트 1층 A-05", "와이드 데님 팬츠", "중청 / M", "bottom", "#5E7EA6"),
  blouse: item("르블랑", "제일평화 3층 318호", "리본 타이 블라우스", "크림 / FREE", "top", "#F1E9DA"),
  leatherBelt: item("더스트", "광희시장 2층 214호", "소가죽 벨트", "브라운 / ONE", "scarf", "#6A4A30"),
  knitVest: item("한올니트", "청평화 1층 가-31", "꽈배기 니트 조끼", "크림 / FREE", "vest", "#EDE3CF"),
};

// ================================================================= build the timeline
function buildTimeline() {
  // ---- signups (8 to 6 weeks ago) and the two unfinished signups
  const signupOrder = [
    ["park", 58], ["lee", 57], ["kim", 55], ["choi", 54], ["han", 52], ["jung", 50],
  ];
  for (const [k, d] of signupOrder) scenario(`signup ${k}`, (at) => at(T(d, 14 + Math.floor(rand() * 6), Math.floor(rand() * 59)), () => signup(U[k], "uncle", UNCLES[k])));
  const retailerDays = { mangwon: 53, yeonnam: 52, seongsu: 51, hapjeong: 49, hannam: 48, gangnam: 47, jamsil: 46, bundang: 45, suwon: 44, bupyeong: 43, fitmood: 42, ilsan: 41 };
  for (const [k, d] of Object.entries(retailerDays)) scenario(`signup ${k}`, (at) => at(T(d, 10 + Math.floor(rand() * 8), Math.floor(rand() * 59)), () => signup(R[k], "retailer", RETAILERS[k])));
  scenario("signup unfinished (role step)", (at) => at(T(2, 23, 12), () => cmd(users.inc0, "bootstrap", {}, `bootstrap-${users.inc0.id}`)));
  scenario("signup unfinished (profile step)", (at) => {
    at(hoursAgo(9), async () => {
      const u = users.inc1;
      await cmd(u, "bootstrap", {}, `bootstrap-${u.id}`);
      await cmd(u, "chooseRole", { role: "retailer" });
      await cmd(u, "saveProfile", { complete: false, values: { name: "을지로 소품가게", contact: "문가은", phone: "010-6218-3304", businessName: "", businessNumber: "", address: "서울 중구 을지로 157", addressDetail: "", salesChannel: "오프라인", markets: ["남대문"] } });
    });
  });

  // ---- connections (accepted ~6-5 weeks ago)
  const accepted = [
    ["mangwon", "park"], ["yeonnam", "park"], ["seongsu", "park"], ["hapjeong", "park"], ["fitmood", "park"],
    ["yeonnam", "kim"], ["hannam", "kim"], ["bupyeong", "kim"],
    ["gangnam", "lee"], ["jamsil", "lee"], ["seongsu", "lee"], ["fitmood", "lee"],
    ["bundang", "choi"], ["suwon", "choi"],
    ["hapjeong", "jung"], ["hannam", "jung"],
    ["bupyeong", "han"], ["ilsan", "han"], ["mangwon", "han"],
  ];
  accepted.forEach(([r, u], i) => {
    scenario(`connect ${r}-${u}`, (at) => {
      const s = {};
      const d = 40 - Math.floor(i / 2);
      at(T(d, 11, 10 + i), async () => {
        s.id = await connect(R[r], U[u]);
      });
      at(T(d, 20, 30 + i), async () => {
        await respondConnection(U[u], s.id, "accepted");
        await chat(R[r], U[u], pick(["삼촌 안녕하세요! 앞으로 잘 부탁드려요.", "안녕하세요, 연결 수락 감사합니다. 이번 주부터 요청 드릴게요.", "삼촌 반가워요. 주로 니트랑 아우터 위주로 부탁드릴 것 같아요."]));
      });
      at(T(d, 22, 5 + i), () => chat(U[u], R[r], pick(["네 사장님, 반갑습니다. 요청 마감 시간만 지켜주시면 다음 날 전달해 드려요.", "잘 부탁드립니다. 사진 같이 보내주시면 같은 상품으로 찾아볼게요.", "반가워요! 마감 전에 요청 주시면 오늘 밤에 바로 다녀올게요."])));
    });
  });
  scenario("connect rejected ilsan→lee", (at) => {
    const s = {};
    at(T(20, 15, 2), async () => (s.id = await connect(R.ilsan, U.lee)));
    at(T(19, 21, 40), () => respondConnection(U.lee, s.id, "rejected"));
  });
  scenario("connect withdrawn gangnam→kim", (at) => {
    const s = {};
    at(T(15, 13, 25), async () => (s.id = await connect(R.gangnam, U.kim)));
    at(T(14, 10, 5), () => respondConnection(R.gangnam, s.id, "withdrawn"));
  });
  scenario("connect pending jamsil→park", (at) => at(T(3, 16, 48), () => connect(R.jamsil, U.park)));
  scenario("connect pending han→suwon (uncle invites)", (at) => at(hoursAgo(20), () => connect(U.han, R.suwon)));

  // ================================================================ requests
  // 완료 (11)
  scenario("C1 완료 1회 전달", (at, s) => {
    at(T(26, 11, 20), () => send(s, R.mangwon, U.park, P.oxford(10)));
    at(T(26, 12, 2), () => say(s, "r", "삼촌, 오늘 마감 전에 넣으면 내일 받을 수 있을까요?"));
    at(T(26, 20, 40), async () => { await say(s, "u", "네 사장님, 오늘 밤 픽업해서 내일 오후 도착 예정이에요."); await accept(s); });
    at(T(25, 2, 15), async () => { await result(s, 10); await say(s, "u", "10장 다 확보했어요.", { photoSpec: s.spec }); });
    at(T(25, 13, 30), () => deliver([[s, 10]]));
    at(T(25, 16, 5), async () => { await receive(s, 0, 10); await say(s, "r", "수령 확인했어요. 포장 꼼꼼하게 해주셔서 감사해요."); });
  });
  scenario("C2 완료 미송 후 2회차", (at, s) => {
    at(T(24, 10, 45), () => send(s, R.yeonnam, U.park, P.cardigan(12)));
    at(T(24, 21, 10), () => accept(s));
    at(T(23, 3, 20), () => result(s, 8, { recheck: kstDate(21), reason: "아이보리 4장은 재입고 대기예요. 목요일 입고 예정이래요.", needsReply: true }));
    at(T(23, 12, 40), () => deliver([[s, 8]]));
    at(T(23, 15, 10), async () => { await receive(s, 0, 8); await wait(s); await say(s, "r", "남은 4장은 기다릴게요. 입고되면 알려주세요."); });
    at(T(21, 2, 50), async () => { await result(s, 12); await say(s, "u", "재입고분 4장 확보했어요. 내일 같이 보내드릴게요."); });
    at(T(21, 12, 20), () => deliver([[s, 4]]));
    at(T(21, 14, 45), () => receive(s, 1, 4));
  });
  scenario("C3 완료 2회 분할 전달", (at, s) => {
    at(T(22, 14, 5), () => send(s, R.seongsu, U.lee, P.slacks(20)));
    at(T(22, 22, 30), () => accept(s));
    at(T(21, 4, 10), () => result(s, 20));
    at(T(21, 11, 0), () => deliver([[s, 12]]));
    at(T(21, 16, 20), () => receive(s, 0, 12));
    at(T(20, 11, 30), () => deliver([[s, 8]]));
    at(T(20, 15, 0), () => receive(s, 1, 8));
  });
  scenario("C4 완료 수령 차이→정정→해결", (at, s) => {
    at(T(21, 10, 10), () => send(s, R.gangnam, U.lee, P.tweed(6)));
    at(T(21, 22, 50), () => accept(s));
    at(T(20, 3, 30), () => result(s, 6));
    at(T(20, 10, 40), () => deliver([[s, 6]]));
    at(T(20, 15, 20), async () => { await receiveWithDiff(s, 0, 5, "6장 중 5장만 들어왔어요. 블랙 S 1장이 없어요."); await say(s, "r", "삼촌, 1장 빠진 것 같아요. 확인 부탁드려요."); });
    at(T(20, 21, 10), async () => { await say(s, "u", "확인해 보니 포장할 때 누락됐어요. 죄송합니다, 다음 회차에 같이 보낼게요."); await propose(s, s.u, "correction", { deliveryId: s.deliveries[0], quantity: 5, received: 5, acquired: 6, reason: "포장 누락 1장 확인. 이번 전달은 5장으로 정정하고 1장은 다음 회차에 전달해요.", recheck: "" }); });
    at(T(19, 9, 30), () => respondProposal(s, s.r, true));
    at(T(19, 9, 35), () => issueAct(s, s.r, "resolve"));
    at(T(19, 12, 0), () => deliver([[s, 1]]));
    at(T(19, 14, 30), () => receive(s, 1, 1));
  });
  scenario("C5 완료 2건 묶음 전달", (at) => {
    const a = { name: "C5a", deliveries: [], issues: [], proposals: [] };
    const b = { name: "C5b", deliveries: [], issues: [], proposals: [] };
    at(T(19, 9, 50), () => send(a, R.fitmood, U.park, P.hoodie(30), { note: "물류센터 입고 마감은 17시예요. 박스당 10장씩 포장 부탁드려요." }));
    at(T(19, 10, 5), () => send(b, R.fitmood, U.park, P.sweat(20)));
    at(T(19, 20, 50), async () => { await accept(a); await accept(b); });
    at(T(18, 3, 40), async () => { await result(a, 30); await result(b, 20); await say(a, "u", "후드 30장, 맨투맨 20장 모두 확보했어요. 내일 오전에 한 번에 보내요."); });
    at(T(18, 10, 15), () => deliver([[a, 30], [b, 20]]));
    at(T(18, 16, 40), async () => { await receive(a, 0, 30); await receive(b, 0, 20); });
  });
  scenario("C6 완료 미송 취소 협의", (at, s) => {
    at(T(17, 9, 30), () => send(s, R.hannam, U.kim, P.trench(8)));
    at(T(17, 11, 10), () => accept(s));
    at(T(17, 15, 20), () => result(s, 5, { recheck: kstDate(14), reason: "베이지 M 3장은 공장 생산 일정이 미정이에요.", needsReply: true }));
    at(T(16, 10, 0), async () => { await say(s, "r", "시즌이 지나서 남은 3장은 취소할게요."); await propose(s, s.r, "cancel", { quantity: 3, acquiredCancelled: 0, reason: "시즌이 지나 남은 미송 3장은 취소할게요." }); });
    at(T(16, 11, 30), () => respondProposal(s, s.u, true));
    at(T(16, 14, 0), () => deliver([[s, 5]]));
    at(T(16, 17, 10), () => receive(s, 0, 5));
  });
  scenario("C7 완료 초과 수령→정정", (at, s) => {
    at(T(15, 13, 0), () => send(s, R.bundang, U.choi, P.woolcoat(4)));
    at(T(15, 21, 0), () => accept(s));
    at(T(14, 2, 30), () => result(s, 4));
    at(T(14, 11, 20), () => deliver([[s, 4]]));
    at(T(14, 15, 40), () => receiveWithDiff(s, 0, 5, "4장 요청했는데 5장이 왔어요. 1장은 돌려드릴게요."));
    at(T(14, 20, 15), () => issueAct(s, s.u, "action", "초과 1장은 다음 픽업 때 회수할게요."));
    at(T(13, 9, 0), () => propose(s, s.u, "correction", { deliveryId: s.deliveries[0], quantity: 4, received: 4, acquired: 4, reason: "초과분 1장 회수 완료. 전달·수령 4장으로 정정해요.", recheck: "" }));
    at(T(13, 10, 20), () => respondProposal(s, s.r, true));
    at(T(13, 10, 25), () => issueAct(s, s.r, "resolve"));
  });
  scenario("C8 완료 사진 확인", (at, s) => {
    at(T(13, 11, 40), () => send(s, R.suwon, U.choi, P.turtleneck(15), { photos: 2 }));
    at(T(13, 21, 30), async () => { await accept(s); await say(s, "u", "이 컬러 맞으시죠?", { photoSpec: s.spec }); });
    at(T(13, 21, 50), () => say(s, "r", "맞아요! 감사합니다."));
    at(T(12, 3, 10), () => result(s, 15));
    at(T(12, 11, 30), () => deliver([[s, 15]]));
    at(T(12, 15, 0), () => receive(s, 0, 15));
  });
  scenario("C9 완료 수락 후 옵션 변경", (at, s) => {
    at(T(12, 10, 30), () => send(s, R.hapjeong, U.jung, P.minibag(3)));
    at(T(12, 13, 0), () => accept(s));
    at(T(12, 13, 40), () => propose(s, s.r, "change", { option: "브라운 / ONE", reason: "블랙 대신 브라운으로 바꿔 주세요." }));
    at(T(12, 15, 10), () => respondProposal(s, s.u, true));
    at(T(12, 18, 30), () => result(s, 3));
    at(T(11, 11, 0), () => deliver([[s, 3]]));
    at(T(11, 14, 20), () => receive(s, 0, 3));
  });
  scenario("C10 완료 문제 신고→조치→해결", (at, s) => {
    at(T(10, 10, 15), () => send(s, R.bupyeong, U.han, P.padvest(10)));
    at(T(10, 20, 30), () => accept(s));
    at(T(9, 1, 40), () => result(s, 10));
    at(T(9, 5, 30), () => deliver([[s, 6]]));
    at(T(9, 11, 10), () => receive(s, 0, 6));
    at(T(9, 11, 40), async () => { await reportIssue(s, { reason: "오염·파손이 있어요: 1장 지퍼가 고장 났어요.", deliveryId: s.deliveries[0] }); await say(s, "r", "지퍼 불량 사진 보내드려요.", { photoSpec: s.spec }); });
    at(T(9, 21, 0), () => issueAct(s, s.u, "action", "교환품 확보했어요. 남은 4장과 같이 보내드릴게요."));
    at(T(8, 5, 10), () => deliver([[s, 4]]));
    at(T(8, 10, 30), async () => { await issueAct(s, s.r, "resolve"); await receive(s, 1, 4); });
  });

  // 취소 종료 (4)
  scenario("X1 취소 수락 전", (at, s) => {
    at(T(9, 10, 0), () => send(s, R.yeonnam, U.kim, P.kidsset(10)));
    at(T(9, 10, 40), () => cancelPending(s));
  });
  scenario("X2 취소 수락 전", (at, s) => {
    at(T(5, 15, 30), () => send(s, R.seongsu, U.park, P.denim(6)));
    at(T(5, 16, 5), async () => { await cancelPending(s); await say(s, "r", "삼촌, 방금 요청은 매장 재고가 있어서 취소했어요."); });
  });
  scenario("X3 취소 협의 전량", (at, s) => {
    at(T(8, 11, 0), () => send(s, R.gangnam, U.lee, P.blouse(8)));
    at(T(8, 22, 10), () => accept(s));
    at(T(7, 10, 20), () => propose(s, s.r, "cancel", { quantity: 8, acquiredCancelled: 0, reason: "고객 주문이 취소돼서 전량 취소할게요." }));
    at(T(7, 21, 0), () => respondProposal(s, s.u, true));
  });
  scenario("X4 취소 협의 확보분 포함", (at, s) => {
    at(T(7, 10, 0), () => send(s, R.ilsan, U.han, P.velvet(5)));
    at(T(7, 20, 30), () => accept(s));
    at(T(6, 2, 10), () => result(s, 2, { recheck: kstDate(3), reason: "와인 3장은 품절, 재입고 미정이에요.", needsReply: true }));
    at(T(6, 11, 0), () => propose(s, s.r, "cancel", { quantity: 5, acquiredCancelled: 2, reason: "세트로 팔아야 해서 확보분 2장 포함 전량 취소할게요. 확보분은 도매처 반품 부탁드려요." }));
    at(T(6, 20, 40), () => respondProposal(s, s.u, true));
  });

  // 거절 (4)
  scenario("J1 거절 품절", (at, s) => {
    at(T(20, 10, 30), () => send(s, R.mangwon, U.park, P.corduroy(5)));
    at(T(20, 21, 15), () => reject(s, "해당 상품이 단종돼서 확보가 어려워요."));
  });
  scenario("J2 거절 최소 수량", (at, s) => {
    at(T(11, 14, 0), () => send(s, R.jamsil, U.lee, P.pleats(3)));
    at(T(11, 22, 20), () => reject(s, "이 도매처는 최소 10장부터 출고해요. 수량 조정해서 다시 요청해 주세요."));
  });
  scenario("J3 거절 휴업", (at, s) => {
    at(T(6, 9, 40), () => send(s, R.bupyeong, U.kim, P.kidsset(12)));
    at(T(6, 10, 30), () => reject(s, "해당 도매처가 이번 주 휴업이에요."));
  });
  scenario("J4 거절 휴가", (at, s) => {
    at(T(3, 11, 0), () => send(s, R.hannam, U.jung, P.leatherBelt(6)));
    at(T(3, 13, 30), () => reject(s, "휴가 기간이라 이번 주는 진행이 어려워요. 다음 주에 다시 요청해 주세요."));
  });

  // 확인 대기 (6)
  scenario("P1 확인 대기", (at, s) => at(hoursAgo(3), () => send(s, R.mangwon, U.park, P.stripe(8))));
  scenario("P2 확인 대기 수락 전 수정", (at, s) => {
    at(hoursAgo(27), () => send(s, R.yeonnam, U.park, P.wideDenim(6)));
    at(hoursAgo(26), async () => {
      const r = await rec(s.r, "requests", s.id);
      await cmd(s.r, "updateRequest", { id: s.id, values: { quantity: 8, note: "M 사이즈 8장으로 늘려 주세요." }, version: r.version });
    });
  });
  scenario("P3 확인 대기", (at, s) => at(hoursAgo(5), () => send(s, R.bundang, U.choi, P.knitVest(10))));
  scenario("P4 확인 대기", (at, s) => at(hoursAgo(22), () => send(s, R.fitmood, U.lee, P.pleats(25))));
  scenario("P5 확인 대기 (휴무 중 삼촌)", (at, s) => {
    at(T(2, 15, 10), () => send(s, R.hapjeong, U.jung, P.minibag(4)));
    at(T(2, 15, 30), () => say(s, "r", "삼촌 휴가 끝나고 확인 부탁드려요."));
  });
  scenario("P6 확인 대기", (at, s) => at(hoursAgo(8), () => send(s, R.ilsan, U.han, P.muffler(12))));

  // 진행 중 (5): accepted, no result yet
  scenario("G1 진행 중", (at, s) => { at(T(2, 10, 0), () => send(s, R.seongsu, U.park, P.oxford(14))); at(T(2, 21, 5), () => accept(s)); });
  scenario("G2 진행 중", (at, s) => { at(hoursAgo(30), () => send(s, R.gangnam, U.lee, P.slacks(6))); at(hoursAgo(18), () => accept(s)); });
  scenario("G3 진행 중", (at, s) => { at(T(3, 10, 40), () => send(s, R.suwon, U.choi, P.cardigan(9))); at(T(3, 21, 20), async () => { await accept(s); await say(s, "u", "오늘 밤 누존 들러서 확인해 볼게요."); }); });
  scenario("G4 진행 중", (at, s) => { at(hoursAgo(28), () => send(s, R.bupyeong, U.han, P.hoodie(10))); at(hoursAgo(16), () => accept(s)); });
  scenario("G5 진행 중", (at, s) => { at(T(2, 11, 30), () => send(s, R.mangwon, U.han, P.turtleneck(5))); at(T(2, 20, 50), () => accept(s)); });

  // 답변 필요 (5)
  scenario("A1 답변 필요", (at, s) => {
    at(T(4, 10, 20), () => send(s, R.yeonnam, U.park, P.oxford(10)));
    at(T(4, 20, 30), () => accept(s));
    at(T(3, 2, 40), () => result(s, 6, { recheck: kstDate(-2), reason: "블루 M 사이즈는 공장 재생산 중이에요. 목요일 입고 예정이에요.", needsReply: true }));
  });
  scenario("A2 답변 필요 전량 미송", (at, s) => {
    at(T(3, 9, 30), () => send(s, R.hannam, U.kim, P.trench(5)));
    at(T(3, 10, 50), () => accept(s));
    at(T(3, 16, 10), () => result(s, 0, { recheck: kstDate(-1), reason: "전 매장 품절이에요. 금요일에 재입고 여부 확인할게요.", needsReply: true }));
  });
  scenario("A3 답변 필요 1회차 수령 후", (at, s) => {
    at(T(5, 10, 0), () => send(s, R.fitmood, U.park, P.denim(30)));
    at(T(5, 20, 10), () => accept(s));
    at(T(4, 3, 0), () => result(s, 18, { recheck: kstDate(-3), reason: "27 사이즈 12장은 다음 주 입고 예정이에요.", needsReply: true }));
    at(T(4, 11, 0), () => deliver([[s, 18]]));
    at(T(4, 16, 20), () => receive(s, 0, 18));
  });
  scenario("A4 답변 필요", (at, s) => {
    at(T(2, 9, 10), () => send(s, R.bupyeong, U.kim, P.kidsset(8)));
    at(T(2, 10, 30), () => accept(s));
    at(T(2, 16, 40), () => result(s, 3, { recheck: kstDate(-2), reason: "110 사이즈만 3장 남아 있었어요.", needsReply: true }));
  });
  scenario("A5 답변 필요", (at, s) => {
    at(T(3, 13, 20), () => send(s, R.hapjeong, U.park, P.corduroy(4)));
    at(T(3, 21, 40), () => accept(s));
    at(T(2, 3, 30), async () => { await result(s, 2, { recheck: kstDate(-4), reason: "브라운 M 2장은 다음 주 화요일 재확인할게요.", needsReply: true }); await say(s, "u", "2장 먼저 확보했어요. 남은 2장 기다리실지 알려주세요."); });
  });

  // 미송 재확인 (4): backorder, recheck date today or earlier, no reply pending
  scenario("M1 미송 재확인", (at, s) => {
    at(T(9, 10, 30), () => send(s, R.seongsu, U.lee, P.blouse(14)));
    at(T(9, 22, 0), () => accept(s));
    at(T(8, 3, 30), () => result(s, 10, { recheck: kstDate(2), reason: "원단 수급이 늦어져 4장은 재입고 미정이에요." }));
    at(T(8, 11, 30), () => deliver([[s, 10]]));
    at(T(8, 15, 0), () => receive(s, 0, 10));
  });
  scenario("M2 미송 재확인 기다리기", (at, s) => {
    at(T(7, 11, 0), () => send(s, R.gangnam, U.lee, P.velvet(12)));
    at(T(7, 22, 20), () => accept(s));
    at(T(6, 3, 10), () => result(s, 5, { recheck: kstDate(1), reason: "와인 컬러 7장은 다음 주 입고 예정이에요.", needsReply: true }));
    at(T(6, 9, 50), async () => { await wait(s); await say(s, "r", "남은 7장 기다릴게요."); });
  });
  scenario("M3 미송 재확인", (at, s) => {
    at(T(6, 10, 10), () => send(s, R.suwon, U.choi, P.stripe(12)));
    at(T(6, 21, 0), () => accept(s));
    at(T(5, 2, 20), () => result(s, 9, { recheck: kstDate(3), reason: "네이비 3장은 공장 확인 중이에요." }));
    at(T(5, 11, 40), () => deliver([[s, 9]]));
    at(T(5, 16, 0), () => receive(s, 0, 9));
  });
  scenario("M4 미송 재확인 오늘", (at, s) => {
    at(T(8, 9, 40), () => send(s, R.mangwon, U.park, P.muffler(6)));
    at(T(8, 20, 30), () => accept(s));
    at(T(7, 2, 50), () => result(s, 3, { recheck: kstDate(0), reason: "오트밀 3장은 다음 입고 때 다시 확인할게요.", needsReply: true }));
    at(T(7, 12, 10), () => wait(s));
  });

  // 미송 대기 (3): backorder, future recheck
  scenario("W1 미송 대기", (at, s) => {
    at(T(4, 10, 10), () => send(s, R.bundang, U.choi, P.woolcoat(10)));
    at(T(4, 21, 30), () => accept(s));
    at(T(3, 3, 20), () => result(s, 4, { recheck: kstDate(-3), reason: "카멜 55 6장은 이번 주말 입고 예정이에요.", needsReply: true }));
    at(T(3, 10, 0), () => wait(s));
  });
  scenario("W2 미송 대기", (at, s) => {
    at(T(3, 10, 30), () => send(s, R.ilsan, U.han, P.knitVest(9)));
    at(T(3, 20, 0), () => accept(s));
    at(T(2, 1, 30), () => result(s, 7, { recheck: kstDate(-1), reason: "크림 2장은 내일 다시 들러볼게요." }));
    at(T(2, 6, 0), () => deliver([[s, 7]]));
    at(T(2, 11, 20), () => receive(s, 0, 7));
  });
  scenario("W3 미송 대기 부분 전달", (at, s) => {
    at(T(6, 11, 50), () => send(s, R.yeonnam, U.park, P.hoodie(16)));
    at(T(6, 21, 20), () => accept(s));
    at(T(5, 3, 0), () => result(s, 10, { recheck: kstDate(-4), reason: "XL 6장은 다음 주 생산분으로 받을게요." }));
    at(T(5, 12, 30), () => deliver([[s, 6]]));
    at(T(5, 15, 40), () => receive(s, 0, 6));
  });

  // 픽업 완료 (3): secured, not delivered yet
  scenario("K1 픽업 완료", (at, s) => { at(hoursAgo(31), () => send(s, R.fitmood, U.lee, P.slacks(12))); at(hoursAgo(21), () => accept(s)); at(hoursAgo(12), () => result(s, 12)); });
  scenario("K2 픽업 완료", (at, s) => { at(hoursAgo(33), () => send(s, R.jamsil, U.lee, P.tweed(5))); at(hoursAgo(23), () => accept(s)); at(hoursAgo(13), async () => { await result(s, 5); await say(s, "u", "5장 확보했어요. 내일 오전 하역장으로 갈게요."); }); });
  scenario("K3 픽업 완료", (at, s) => { at(T(4, 11, 0), () => send(s, R.hapjeong, U.jung, P.leatherBelt(2))); at(T(4, 13, 0), () => accept(s)); at(T(4, 17, 30), () => result(s, 2)); });

  // 수령 대기 (6)
  scenario("D1 수령 대기", (at, s) => { at(T(2, 10, 20), () => send(s, R.mangwon, U.park, P.cardigan(8))); at(T(2, 20, 30), () => accept(s)); at(T(1, 2, 40), () => result(s, 8)); at(hoursAgo(6), () => deliver([[s, 8]])); });
  scenario("D2 수령 대기 2회차", (at, s) => {
    at(T(3, 9, 20), () => send(s, R.yeonnam, U.kim, P.kidsset(5)));
    at(T(3, 10, 10), () => accept(s));
    at(T(3, 15, 0), () => result(s, 5));
    at(T(3, 16, 30), () => deliver([[s, 3]]));
    at(T(2, 13, 0), () => receive(s, 0, 3));
    at(hoursAgo(4), () => deliver([[s, 2]]));
  });
  scenario("D3 수령 대기", (at, s) => { at(T(2, 13, 10), () => send(s, R.bundang, U.choi, P.sweat(6))); at(T(2, 21, 0), () => accept(s)); at(T(1, 2, 0), () => result(s, 6)); at(hoursAgo(7), () => deliver([[s, 6]])); });
  scenario("D4 수령 대기 2건 묶음", (at) => {
    const a = { name: "D4a", deliveries: [], issues: [], proposals: [] };
    const b = { name: "D4b", deliveries: [], issues: [], proposals: [] };
    at(T(2, 10, 30), async () => { await send(a, R.bupyeong, U.han, P.stripe(4)); await send(b, R.bupyeong, U.han, P.denim(6)); });
    at(T(2, 20, 20), async () => { await accept(a); await accept(b); });
    at(T(1, 1, 50), async () => { await result(a, 4); await result(b, 6); });
    at(hoursAgo(9), async () => { await deliver([[a, 4], [b, 6]]); await say(a, "u", "부평 지하상가 B-112로 2건 같이 전달했어요."); });
  });
  scenario("D5 수령 대기", (at, s) => { at(T(1, 10, 0), () => send(s, R.suwon, U.choi, P.muffler(3))); at(T(1, 20, 40), () => accept(s)); at(hoursAgo(10), () => result(s, 3)); at(hoursAgo(5), () => deliver([[s, 3]])); });

  // 문제 확인 중 (5)
  scenario("I1 문제 수량 부족 수령", (at, s) => {
    at(T(4, 11, 10), () => send(s, R.seongsu, U.park, P.wideDenim(10)));
    at(T(4, 20, 0), () => accept(s));
    at(T(3, 2, 30), () => result(s, 10));
    at(T(3, 11, 50), () => deliver([[s, 10]]));
    at(T(3, 16, 30), () => receiveWithDiff(s, 0, 8, "10장 중 8장만 왔어요. 2장이 부족해요."));
  });
  scenario("I2 문제 완료 후 파손 신고·조치", (at, s) => {
    at(T(4, 10, 40), () => send(s, R.gangnam, U.lee, P.blouse(6)));
    at(T(4, 22, 0), () => accept(s));
    at(T(3, 3, 0), () => result(s, 6));
    at(T(3, 10, 50), () => deliver([[s, 6]]));
    at(T(3, 14, 20), () => receive(s, 0, 6));
    at(T(3, 15, 0), async () => { await reportIssue(s, { reason: "오염·파손이 있어요: 2장 단추가 깨져 있어요.", deliveryId: s.deliveries[0] }); await say(s, "r", "단추 파손 사진이에요.", { photoSpec: s.spec }); });
    at(T(2, 22, 30), () => issueAct(s, s.u, "action", "교환품 확보 중이에요. 내일 전달할게요."));
  });
  scenario("I3 문제 수령 차이 조치 기록", (at, s) => {
    at(T(5, 10, 0), () => send(s, R.ilsan, U.han, P.padvest(8)));
    at(T(5, 20, 30), () => accept(s));
    at(T(4, 1, 20), () => result(s, 8));
    at(T(4, 5, 40), () => deliver([[s, 8]]));
    at(T(4, 11, 0), () => receiveWithDiff(s, 0, 7, "8장 중 7장 받았어요."));
    at(T(4, 21, 10), () => issueAct(s, s.u, "action", "1장 누락 확인했어요. 다음 배송에 포함할게요."));
  });
  scenario("I4 문제 전달 전 옵션 다름 (보류)", (at, s) => {
    at(T(2, 9, 30), () => send(s, R.fitmood, U.park, P.sweat(20), { photos: 2 }));
    at(T(2, 20, 10), () => accept(s));
    at(T(1, 3, 20), async () => { await result(s, 20); await say(s, "u", "20장 확보했어요. 사진 확인해 주세요.", { photoSpec: { ...s.spec, color: "#5C5F66" } }); });
    at(T(1, 9, 40), () => reportIssue(s, { reason: "상품·옵션이 달라요: 사진과 컬러가 달라요. 5장 보류 부탁드려요.", held: 5 }));
  });
  scenario("I5 문제 전달분 수량 부족", (at, s) => {
    at(T(3, 10, 0), () => send(s, R.suwon, U.choi, P.knitVest(4)));
    at(T(3, 20, 50), () => accept(s));
    at(T(2, 2, 0), () => result(s, 4));
    at(T(2, 11, 30), () => deliver([[s, 4]]));
    at(T(2, 15, 10), () => reportIssue(s, { reason: "수량이 부족해요: 4장 중 3장만 들어 있었어요.", deliveryId: s.deliveries[0] }));
  });

  // 변경·취소 협의 중 (5)
  scenario("Q1 협의 중 변경안", (at, s) => {
    at(hoursAgo(34), () => send(s, R.mangwon, U.han, P.oxford(6)));
    at(hoursAgo(24), () => accept(s));
    at(hoursAgo(11), () => propose(s, s.r, "change", { option: "블루 / L", quantity: 7, reason: "사이즈를 L로 바꾸고 1장 더 부탁드려요." }));
  });
  scenario("Q2 협의 중 미송 취소", (at, s) => {
    at(T(3, 10, 50), () => send(s, R.yeonnam, U.park, P.stripe(10)));
    at(T(3, 21, 10), () => accept(s));
    at(T(2, 2, 30), () => result(s, 4, { recheck: kstDate(-3), reason: "네이비 6장은 다음 주 입고예요.", needsReply: true }));
    at(hoursAgo(14), () => propose(s, s.r, "cancel", { quantity: 6, acquiredCancelled: 0, reason: "남은 미송 6장은 취소할게요." }));
  });
  scenario("Q3 협의 중 확보 수량 정정", (at, s) => {
    at(T(5, 13, 0), () => send(s, R.hapjeong, U.jung, P.minibag(5)));
    at(T(5, 14, 20), () => accept(s));
    at(T(5, 18, 0), () => result(s, 5));
    at(T(4, 11, 30), () => deliver([[s, 3]]));
    at(T(4, 15, 10), () => receive(s, 0, 3));
    at(T(4, 19, 0), () => propose(s, s.u, "correction", { acquired: 4, reason: "확보 수량을 5장으로 잘못 기록했어요. 실제 확보는 4장이에요.", recheck: kstDate(-2) }));
  });
  scenario("Q4 협의 중 배송지 변경 (이전 변경안 거절)", (at, s) => {
    at(T(4, 12, 0), () => send(s, R.bundang, U.choi, P.velvet(6)));
    at(T(4, 21, 10), () => accept(s));
    at(T(3, 2, 10), () => result(s, 6));
    at(T(3, 9, 30), () => propose(s, s.r, "change", { quantity: 8, reason: "2장 추가 가능할까요?" }));
    at(T(3, 20, 40), () => respondProposal(s, s.u, false));
    at(T(3, 20, 45), () => say(s, "u", "추가 2장은 도매처 재고가 없어서 어려워요."));
    at(hoursAgo(15), () => propose(s, s.r, "change", { addressDetail: "2층 201호 (사무실)", reason: "이번 건은 2층 사무실로 받아야 해요." }));
  });
  scenario("Q5 협의 중 삼촌 취소 요청 (이전 제안 철회)", (at, s) => {
    at(hoursAgo(40), () => send(s, R.bupyeong, U.kim, P.kidsset(4)));
    at(hoursAgo(38), () => accept(s));
    at(hoursAgo(30), () => propose(s, s.u, "cancel", { quantity: 4, acquiredCancelled: 0, reason: "도매처 품절이라 취소 협의 요청드려요." }));
    at(hoursAgo(29), async () => { await respondProposal(s, s.u, false); await say(s, "u", "다른 매장에 재고 있는지 한 번 더 확인해 볼게요."); });
    at(hoursAgo(7), () => propose(s, s.u, "cancel", { quantity: 4, acquiredCancelled: 0, reason: "다른 매장도 품절 확정이에요. 취소 확인 부탁드려요." }));
  });

  // 도매처 주문서 (3): requestType 'wholesaler' (202610130004). No product or option, quantity 1,
  // 수령지 and note copied from the retailer's profile by the server.
  scenario("H1 주문서 확인 대기 (도매처 3곳)", (at, s) =>
    at(hoursAgo(4), () =>
      sendWholesalers(s, R.jamsil, U.lee, [
        { wholesaler: "르블랑", location: "제일평화 3층 318호" },
        { wholesaler: "라인바이", location: "제일평화 3층 305호" },
        { wholesaler: "아뜰리에 봄", location: "제일평화 2층 211호" },
      ]),
    ),
  );
  scenario("H2 주문서 완료", (at, s) => {
    at(T(12, 11, 5), () =>
      sendWholesalers(s, R.mangwon, U.park, [
        { wholesaler: "모노스튜디오", location: "디오트 2층 B-12" },
        { wholesaler: "데이핏", location: "디오트 3층 C-07" },
      ]),
    );
    at(T(12, 21, 0), () => accept(s));
    at(T(11, 2, 30), async () => { await result(s, 1); await say(s, "u", "두 매장 주문분 모두 챙겼어요."); });
    at(T(11, 12, 50), () => deliver([[s, 1]]));
    at(T(11, 15, 20), () => receive(s, 0, 1));
  });
  scenario("H3 주문서 수령 (최근 완료, 7일 안)", (at, s) => {
    at(T(3, 10, 30), () => sendWholesalers(s, R.yeonnam, U.kim, [{ wholesaler: "블랑쉬", location: "남대문 대도상가 E동 2층 18호" }]));
    at(T(3, 17, 40), () => accept(s));
    at(T(2, 9, 10), () => result(s, 1));
    at(T(2, 14, 0), () => deliver([[s, 1]]));
    at(T(2, 17, 30), () => receive(s, 0, 1));
  });

  // ---- chat message menu (202610130000): one edited and one deleted message
  scenario("chat mangwon-park edit/delete", (at) => {
    const m = {};
    at(T(6, 15, 0), async () => (m.edit = await chat(R.mangwon, U.park, "내일 오전엔 매장이 비어요. 오후 2시 이후 전달 부탁드려요.")));
    at(T(6, 15, 3), () => editMessage(R.mangwon, m.edit, "내일 오전엔 매장이 비어요. 오후 3시 이후 전달 부탁드려요."));
    at(T(6, 15, 6), async () => (m.del = await chat(R.mangwon, U.park, "다른 거래처에 보낼 메시지를 잘못 보냈어요.")));
    at(T(6, 15, 7), () => deleteMessage(R.mangwon, m.del));
    at(T(6, 20, 10), () => chat(U.park, R.mangwon, "네 사장님, 오후 3시 이후로 맞춰 갈게요."));
  });

  // ---- drafts (not sent yet)
  scenario("drafts", (at) => {
    at(hoursAgo(20), () => cmd(R.mangwon, "saveDraft", { id: randomUUID(), values: { uncleId: U.park.id, wholesaler: "누보", location: "청평화 2층 나-14", product: "롱 패딩 코트", option: "블랙 / FREE", quantity: 5, address: R.mangwon.p.address, addressDetail: R.mangwon.p.addressDetail, note: "", photos: [] } }));
    at(hoursAgo(6), () => cmd(R.gangnam, "saveDraft", { id: randomUUID(), values: { uncleId: U.lee.id, wholesaler: "르블랑", location: "", product: "새틴 슬립 원피스", option: "", quantity: 0, address: R.gangnam.p.address, addressDetail: R.gangnam.p.addressDetail, note: "", photos: [] } }));
    at(hoursAgo(2), () => cmd(R.suwon, "saveDraft", { id: randomUUID(), values: { uncleId: "", wholesaler: "", location: "", product: "앙고라 니트", option: "", quantity: 3, address: R.suwon.p.address, addressDetail: R.suwon.p.addressDetail, note: "", photos: [] } }));
  });

  // ---- free chat between partners (not tied to a request)
  const smalltalk = [
    ["mangwon", "park", 18, ["삼촌, 다음 주에 겨울 아우터 위주로 요청 많이 드릴 것 같아요.", "네 좋아요. 디오트 아우터 매장 몇 군데 미리 봐둘게요."]],
    ["fitmood", "lee", 9, ["이번 주 금요일은 물류센터 휴무라 목요일까지만 받아요.", "알겠습니다. 목요일 오전까지 맞춰 드릴게요."]],
    ["hannam", "jung", 4, ["삼촌 휴가 잘 다녀오세요!", "감사합니다. 다음 주 화요일부터 다시 받을게요."]],
    ["bupyeong", "han", 2, ["삼촌 지하상가 문 10시에 열어요.", "네, 10시 이후로 맞춰서 갈게요."]],
    ["suwon", "choi", 1, ["다음 주 니트 신상 나오면 사진 먼저 보내주실 수 있나요?", "네 누존 신상 들어오면 사진 찍어서 보내드릴게요."]],
  ];
  for (const [r, u, d, [a, b]] of smalltalk) {
    scenario(`chat ${r}-${u}`, (at) => {
      at(T(d, 14, 10), () => chat(R[r], U[u], a));
      at(T(d, 20, 35), () => chat(U[u], R[r], b));
    });
  }
  scenario("chat suwon-choi photo", (at) => at(hoursAgo(1.5), () => chat(U.choi, R.suwon, "누존에 들어온 신상 니트예요.", { photoSpec: P.knitVest(1) })));

  // ---- uncles renew invite codes; reminders for overdue 미송
  for (const k of ["park", "lee", "han"]) scenario(`renew code ${k}`, (at) => at(hoursAgo(30 + Math.floor(rand() * 20)), () => cmd(U[k], "renewCode", {})));
  for (const k of Object.keys(UNCLES)) scenario(`reminders ${k}`, (at) => at(hoursAgo(1 + rand()), () => cmd(U[k], "refreshReminders", {})));

  // ---- people open the app and read their notices / chats (older items end up read)
  for (const user of [...Object.values(R), ...Object.values(U)]) {
    scenario(`read sweeps ${user.key}`, (at) => {
      for (const d of [36, 30, 24, 19, 15, 11, 8, 5, 3]) at(T(d, 9 + Math.floor(rand() * 4), Math.floor(rand() * 59)), () => readAll(user));
      if (rand() < 0.6) at(hoursAgo(10 + rand() * 12), () => readAll(user));
    });
  }

  // ---- landing page leads (publishable key, like the site's server action)
  const ua = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    android: "Mozilla/5.0 (Linux; Android 16; SM-S938N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    kakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.8.0",
  };
  const insta = { utm_source: "instagram", utm_medium: "social", utm_campaign: "fw26_launch" };
  const naver = { utm_source: "naver", utm_medium: "cpc", utm_campaign: "brand_search", utm_term: "사입삼춘" };
  const kakaoCh = { utm_source: "kakao", utm_medium: "channel", utm_campaign: "oct_news" };
  const LEADS = [
    [21, 14, { role: "retailer", name: "정다은", business_name: "신촌 데일리클로젯", contact: "010-3021-7745", market: "동대문", message: "동대문 야간 사입을 처음 맡겨 보려는데 수수료 구조가 궁금해요.", utm: insta, user_agent: ua.iphone }],
    [19, 22, { role: "uncle", name: "김영철", business_name: null, contact: "kimyc.dm@gmail.com", market: "동대문", message: "청평화 15년차 사입삼촌입니다. 거래처 관리용으로 써보고 싶어요.", utm: null, user_agent: ua.android }],
    [17, 11, { role: "retailer", name: "이민아", business_name: "온라인몰 민아샵", contact: "minashop@naver.com", market: "동대문", message: null, utm: naver, user_agent: ua.mac }],
    [15, 16, { role: "other", name: "박서윤", business_name: "패션 커머스 스타트업", contact: "kakao: seoyun_p", market: null, message: "물류 연동 제휴 문의드립니다.", utm: null, user_agent: ua.mac }],
    [13, 10, { role: "retailer", name: "최유리", business_name: "대구 유리옷장", contact: "010-9932-1180", market: "남대문", message: "지방이라 택배 발송도 되는지 궁금해요.", utm: kakaoCh, user_agent: ua.kakao }],
    [11, 23, { role: "uncle", name: "오세훈", business_name: "남대문 오삼촌", contact: "010-2209-4471", market: "남대문", message: "남대문 아동복 전문입니다. 사전 신청합니다.", utm: null, user_agent: ua.android }],
    [10, 13, { role: "retailer", name: "한소희", business_name: "망원 소소", contact: "sohee.han@gmail.com", market: "동대문", message: "거래 중인 삼촌도 같이 가입해야 하나요?", utm: insta, user_agent: ua.iphone }],
    [8, 9, { role: "retailer", name: "윤재민", business_name: "재민 셀렉트", contact: "010-4410-2983", market: "기타", message: "광희시장 위주로 사입해요.", utm: naver, user_agent: ua.android }],
    [7, 15, { role: "other", name: "강다현", business_name: "패션 유튜버", contact: "dahyun.kang@daum.net", market: null, message: "촬영 협업 문의예요.", utm: null, user_agent: ua.iphone }],
    [6, 2, { role: "uncle", name: "서준호", business_name: null, contact: "010-7012-3398", market: "동대문", message: null, utm: kakaoCh, user_agent: ua.kakao }],
    [5, 12, { role: "retailer", name: "임채원", business_name: "채원 부티크", contact: "010-6621-0943", market: "동대문", message: "베타 언제 열리나요?", utm: insta, user_agent: ua.iphone }],
    [3, 18, { role: "retailer", name: "노하은", business_name: "하은상점", contact: "kakao: haeun_store", market: "남대문", message: "사입 내역을 엑셀로 받을 수 있나요?", utm: null, user_agent: ua.mac }],
    [2, 11, { role: "retailer", name: "test", business_name: null, contact: "aaaaa1", market: null, message: null, utm: null, user_agent: ua.mac, timingSuspect: true }],
    [1, 20, { role: "uncle", name: "장민석", business_name: "제일평화 장삼촌", contact: "010-5530-1172", market: "동대문", message: "야간에만 활동해요. 알림이 잘 오면 좋겠어요.", utm: naver, user_agent: ua.android }],
    [0.2, null, { role: "other", name: "E2E 점검", business_name: null, contact: "e2e-check@invalid", market: null, message: "자동 점검 행", utm: null, user_agent: "Playwright", e2e: true }],
  ];
  LEADS.forEach(([d, hh, lead], i) => {
    scenario(`lead ${i + 1}`, (at) =>
      at(hh === null ? hoursAgo(d * 24) : T(d, hh, Math.floor(rand() * 59)), async () => {
        const { timingSuspect, e2e, ...row } = lead;
        const source = e2e ? "e2e" : timingSuspect ? "landing-signup:timing-suspect" : "landing-signup";
        const { error } = await anon.from("landing_leads").insert({ ...row, source, consent: true });
        if (error) throw new Error(`lead ${i + 1}: ${error.message}`);
        leadPlan.push(new Date(tick()).toISOString());
      }),
    );
  });
}
const leadPlan = [];

// ================================================================= time shift (LOCAL SQL, timestamps only)
function timeShiftSql() {
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  return `
begin;
create temp table seed_plan(op_id text primary key, sim timestamptz not null) on commit drop;
insert into seed_plan values ${plan.map(([id, t]) => `(${q(id)}, ${q(t)})`).join(",\n")};
create temp table seed_leads(rn int primary key, sim timestamptz not null) on commit drop;
${leadPlan.length ? `insert into seed_leads values ${leadPlan.map((t, i) => `(${i + 1}, ${q(t)})`).join(",")};` : ""}
create temp table seed_win on commit drop as
  select o.id as op_id, o.actor, o.created_at as t0, lead(o.created_at) over (order by o.created_at, o.id) as t1, p.sim
  from saip_private.operations o left join seed_plan p on p.op_id = o.id;
do $$ begin
  if exists (select 1 from seed_win where sim is null) then
    raise exception 'operations without a simulated time: %', (select string_agg(op_id, ', ') from seed_win where sim is null);
  end if;
end $$;
create index on seed_win (t0);
create function pg_temp.shift(t timestamptz) returns timestamptz language sql stable as $f$
  select coalesce((select w.sim + (t - w.t0) from seed_win w where w.t0 <= t order by w.t0 desc limit 1), t)
$f$;
create function pg_temp.shift_json(v jsonb) returns jsonb language sql stable as $f$
  select case
    when v is null or jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' then v
    when position('T' in (v #>> '{}')) > 0 then to_jsonb(pg_temp.shift((v #>> '{}')::timestamptz))
    else to_jsonb(pg_temp.shift((v #>> '{}')::timestamptz)::text)
  end
$f$;
create function pg_temp.shift_data(d jsonb) returns jsonb language plpgsql stable as $f$
declare p text; r jsonb := d;
begin
  -- receivedAt (202610130004) drives the app's 수령 / 완료 label; editedAt / deletedAt come from the message menu.
  foreach p in array array['createdAt','updatedAt','correctedAt','receivedAt','editedAt','deletedAt',
      'before,createdAt','before,updatedAt','before,correctedAt','before,receivedAt',
      'after,createdAt','after,updatedAt','after,correctedAt','after,receivedAt'] loop
    if r #> string_to_array(p, ',') is not null then
      r := jsonb_set(r, string_to_array(p, ','), pg_temp.shift_json(r #> string_to_array(p, ',')));
    end if;
  end loop;
  if coalesce(r->>'codeExpires', '') <> '' then
    r := jsonb_set(r, '{codeExpires}', to_jsonb(pg_temp.shift((r->>'codeExpires')::timestamptz - interval '7 days') + interval '7 days'));
  end if;
  return r;
end $f$;

update public.saip_records set data = pg_temp.shift_data(data), updated_at = pg_temp.shift(updated_at);

with a as (select actor, min(sim) as first_sim, max(sim) as last_sim from seed_win group by actor)
update auth.users u set created_at = a.first_sim - interval '3 minutes', email_confirmed_at = a.first_sim - interval '3 minutes',
  updated_at = a.last_sim, last_sign_in_at = a.last_sim
from a where a.actor = u.id;
update auth.identities i set created_at = u.created_at, updated_at = u.updated_at, last_sign_in_at = u.last_sign_in_at
from auth.users u where i.user_id = u.id and u.id in (select actor from seed_win);
update auth.users set created_at = (select min(created_at) from auth.users) - interval '2 days',
  email_confirmed_at = (select min(created_at) from auth.users) - interval '2 days'
where email = ${q(ADMIN.email)};

update storage.objects o set created_at = (a.data->>'createdAt')::timestamptz - interval '2 seconds',
  updated_at = (a.data->>'createdAt')::timestamptz - interval '2 seconds', last_accessed_at = (a.data->>'createdAt')::timestamptz
from public.saip_records a where a.collection = 'attachments' and a.data->>'path' = o.name and o.bucket_id = 'saip-attachments';

update public.landing_leads l set created_at = s.sim
from (select id, row_number() over (order by created_at, id) as rn from public.landing_leads) x join seed_leads s on s.rn = x.rn
where l.id = x.id;

update saip_private.operations o set created_at = w.sim from seed_win w where w.op_id = o.id and w.actor = o.actor;
commit;
`;
}

// ================================================================= main
async function main() {
  const { data: existing, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 5 });
  if (error) throw new Error(`cannot reach local auth: ${error.message}`);
  if (existing.users.length) throw new Error("local database is not empty. Run supabase-local/scripts/reset.sh (db reset + seed) instead.");

  const t0 = Date.now();
  // Backoffice admin login (LOCAL ONLY). No saip account: it never calls bootstrap.
  const { error: adminError } = await admin.auth.admin.createUser({
    email: ADMIN.email,
    password: ADMIN.password,
    email_confirm: true,
    user_metadata: { full_name: ADMIN.name, name: ADMIN.name },
    app_metadata: { backoffice_role: "admin" },
  });
  if (adminError) throw new Error(`admin user: ${adminError.message}`);

  for (const [k, p] of Object.entries(UNCLES)) U[k] = await createAuthUser(k, `${p.slug}@demo.agentuncle.local`, p.contact.replace(/^.+ /, ""), p.provider);
  for (const [k, p] of Object.entries(RETAILERS)) R[k] = await createAuthUser(k, `${p.slug}@demo.agentuncle.local`, p.contact, p.provider);
  for (const [i, p] of INCOMPLETE.entries()) await createAuthUser(`inc${i}`, `${p.slug}@demo.agentuncle.local`, p.fullName, p.provider);

  buildTimeline();
  steps.sort((a, b) => a.time - b.time || a.seq - b.seq);
  process.stdout.write(`running ${steps.length} steps `);
  for (const [i, st] of steps.entries()) {
    simCursor = Math.max(st.time, simCursor + 1000);
    try {
      await st.fn();
    } catch (e) {
      throw new Error(`step "${st.name}" @ ${new Date(st.time).toISOString()}: ${e.message}`);
    }
    if (i % 40 === 0) process.stdout.write(".");
  }
  if (simCursor > NOW) console.warn(`\nwarning: simulated clock ran ${Math.round((simCursor - NOW) / 1000)} s past now`);
  console.log(` done in ${Math.round((Date.now() - t0) / 1000)} s, ${plan.length} commands`);

  psql(timeShiftSql());
  console.log(`time shift applied (${plan.length} operations, ${leadPlan.length} leads)`);
}

await main();
