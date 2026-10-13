# 사입삼춘 Backoffice (/admin): Design Spec v1

- **Date:** 2026-10-13
- **Status:** proposed, waiting for client review.
- **Product:** the operator console for the 사입삼춘 (Agent Uncle) app. It lives under `/admin` in this repo (Next.js 16.4, React 19.3, Tailwind v4). The marketing landing at `/` is finished and does not change.
- **Data:** the live Supabase project `auicerytbhnqeakmkscs`, which the app also uses. All development and every test run against the local stack in `supabase-local/` (ports 553xx).
- **Ground rules:** the app repo (`/Users/edmond104/conductor/workspaces/agent-uncle/lisbon`) is read-only for this project. Nothing in this phase writes to the live database or changes project settings.

**Companion files.** These are normative.

| Topic | File |
|---|---|
| Shared UI and screen copy deck (full §9 and §10, with exact Korean copy for every screen, column, filter, view, action, dialog and state) | `docs/superpowers/specs/2026-10-13-backoffice-screens.md` |
| Build plan | `docs/superpowers/plans/2026-10-13-backoffice-build-plan.md` |
| TDD task steps | `docs/superpowers/plans/2026-10-13-backoffice-tasks.md` |
| Migration (canonical and tested) | `supabase/backoffice/20261013090000_backoffice_admin_layer.sql` |
| Behaviour checks and runner | `supabase/backoffice/backoffice_checks.sql`, `supabase/backoffice/run-checks.sh` |
| Brand | `docs/superpowers/specs/2026-10-11-landing-design.md`, `.context/brief/product.md` §9 |

If any other copy of the migration differs from the repo file, the repo file wins.

## 0. Decisions

| # | Decision |
|---|---|
| D1 | The console is a second root layout, `src/app/(admin)`. The landing moves unchanged into `src/app/(site)`. CSS, fonts and providers never mix, and moving between `/` and `/admin` is a full page load. |
| D2 | There is no service-role or secret key anywhere in the web app: not in code, env, build or runtime. Every staff call uses the staff member's own JWT (publishable key plus an `@supabase/ssr` cookie session) against `SECURITY DEFINER` RPCs that start with `require_admin()`. |
| D3 | Staff are separate auth users listed in `public.backoffice_admins`, with one of three roles: `owner` (관리자), `operator` (운영자), `viewer` (열람자). `app_metadata` flags are ignored. Granting refuses users with an app account or an unconfirmed email. |
| D4 | (Changed 2026-10-14 at the owner's request.) Sign-in is staff ID and password only, on every target; Google sign-in was removed. A staff ID maps to the Auth email `<id>@staff.agentuncle.invalid` on live (a reserved domain no app user can have) and `<id>@agentuncle.local` locally; the form refuses any other domain, so app accounts can never sign in. Staff Auth users are created by an owner with the Auth admin API (they cannot sign up). TOTP MFA (aal2) is enforced per staff member through `require_mfa`. A staff session lasts at most 12 hours after sign-in. |
| D5 | Staff can only read trade records. No RPC edits counters, status, readers, events, receipts, deliveries, messages, proposals or issues, and none acts on behalf of a party. Corrections stay two-party inside the app (finish() and the proposal rules). |
| D6 | Staff writes are narrow: document-review projection, suspension, notes, cases, lead status, in-app notices, remote config, staff management. Each write is idempotent (`p_operation_id`) and appends an immutable, sha256 hash-chained audit row in the same transaction. |
| D7 | Sensitive reads are audited: unmasked dossiers, chat transcripts, files, lead lists, user lookups and exports. Chats and files also need a typed reason. Identical views are throttled to 1 audit row per 10 minutes. |
| D8 | Viewers see PII masked. Operators see it unmasked, and their dossier views are audited. Owners also get the app-wide switches, PII exports and staff management. |
| D9 | Remote config and notices live in new tables. The app reads them only through `app_bootstrap_config()`. The Realtime publication is unchanged in v1; the app polls. |
| D10 | The migration ships only through the app repo's migration history. This repo keeps the canonical proposal and its checks, and applies them only to the LOCAL stack. |
| D11 | The console is off in any deployment without `BACKOFFICE_SUPABASE_TARGET`. Only Production sets `live`, so preview URLs never reach live data. |
| D12 | v1 has a light theme only and is desktop-first. It is designed for 1280px and above and usable down to 1024px. |
| D13 | The attention tone is the app's own red, `#D22030`: a weak tint, always paired with an icon and a label, and used only in admin files. Orange, lime and purple stay banned everywhere. `scripts/qa/no-banned-colors.mjs` gets an admin-path exemption for the two app reds only. |

## 1. Goals and non-goals

**Goals.** An operator can:
1. see what needs a human right now;
2. trace any request's full quantity history and spot ledger breaks;
3. follow signups and verify business documents (사업자등록증);
4. handle disputes, with audited access to chats and files;
5. control the app remotely: maintenance and write freeze, the update gate, feature flags, notices and suspension;
6. follow up landing leads;
7. prove who saw or changed what.

**Non-goals for v1:**
- editing trade records, or impersonation;
- sending messages or notices as a user;
- remote push;
- 국세청 (NTS) business-status lookup;
- a server-side recheck scheduler (pg_cron is not installed);
- a 탈퇴 or deletion workflow;
- a night theme;
- bulk edits and custom saved views;
- Realtime in the console.

## 2. Scope

### 2.1 v1 (must ship)

| Area | Screens | Staff writes |
|---|---|---|
| Access | 로그인, 2단계 인증, 권한 없음, 사용할 수 없음, 내 계정 | - |
| 운영 현황 | 대시보드, 운영 점검 | - |
| 계정·관계 | 계정·가입 (list and dossier), 거래처 연결 | document review, suspend and restore, notes, cases |
| 거래 흐름 | 사입 요청 (list, sheet, full page), 전달·수령, 미송 재확인, 문제·정정 | notes, cases |
| 소통 | 채팅 열람 (reason-gated), 알림·공지 | notices |
| 앱 제어 | 원격 설정 (maintenance, minimum version, feature flags, support) with history and 되돌리기 | config |
| 웹사이트 | 랜딩 문의 | lead status, notes |
| 관리 | 감사 로그 (+ 앱 작업 기록, chain verify), 운영 계정 | grant and revoke staff |
| Cross-cutting | ⌘K, search page, audited CSV export, auto-refresh, list state in the URL | - |

App users only see notices, maintenance screens, update gates and the verification label after the app-side change in §11.3 ships. Suspension and the write freeze are enforced server-side as soon as the migration lands. The affected screens say this in their own copy.

### 2.2 Later

- NTS business-status API (today "확인함" means a person checked the image).
- Server-side 미송 reminders and "재확인 알림 다시 보내기". These need a scheduler and a new app command.
- Remote push.
- A staff Realtime channel.
- Bulk case assignment and custom saved views.
- Keyset pagination, materialized counters and more indexes, once `saip_records` passes about 50k rows.
- PIPA erasure tooling and retention jobs.
- Night theme and a mobile layout.

## 3. Architecture

```
Browser (staff) ── httpOnly cookie session, path=/admin, SameSite=Lax (no Supabase token readable in JS)
  ▼
Next.js 16 /admin (Vercel, Node runtime)
  ├─ src/proxy.ts        session refresh, optimistic redirect, admin headers (matcher /admin only)
  ├─ Server Components   verifyAdmin() → rpc.* with the staff JWT (publishable key); never cached across users
  ├─ Server Actions      verifyAdmin() → zod → rpc.* with p_operation_id → revalidatePath
  └─ Route Handlers      /admin/auth/callback (PKCE), /admin/export/[kind] (POST → CSV)
  ▼
PostgREST /rpc/backoffice_* (EXECUTE: authenticated only)
  ▼
Postgres SECURITY DEFINER RPCs (owner postgres, search_path '')
  require_admin(role) + aal2 → read saip_records / auth.users / storage.objects / landing_leads (never drafts)
  → write only backoffice_* / app_* tables (+ accounts verification projection, + auth ban) → audit() hash chain
Storage: createSignedUrl(path, 60) with the staff session; policy backoffice_attachment_read allows it only
within 10 minutes after an audited backoffice_attachment_access by the same person.
```

**Environment variables.** All server-only. The console never reads `NEXT_PUBLIC_*` Supabase values.

| Variable | Local | Production | Preview |
|---|---|---|---|
| `BACKOFFICE_SUPABASE_TARGET` | `local` | `live` | unset (console off) |
| `BACKOFFICE_SUPABASE_URL` | `http://127.0.0.1:55321` | `https://auicerytbhnqeakmkscs.supabase.co` | - |
| `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY` | local publishable key | the publishable key the app and landing already ship | - |

- `target=local` must point at localhost, and `target=live` must not. A mismatch renders "운영 화면 설정을 확인해 주세요."
- `supabase-local/scripts/write-env.mjs` writes the local block into `.env.development.local`.
- The landing's `NEXT_PUBLIC_SUPABASE_*` are untouched.
- Every PostgREST call carries `x-client-info: agent-uncle-backoffice`. It also forwards the staff member's address as `x-backoffice-client-ip` (first `x-forwarded-for` entry) and `x-backoffice-user-agent` (at most 300 characters). `client_info()` stores these, best effort, in each audit row.

## 4. Routes, layouts and proxy

```
src/app/(site)/{layout,page,opengraph-image}.tsx, globals.css   moved, content unchanged (actions/, fonts/, robots, sitemap, icons stay)
src/app/(admin)/layout.tsx       <html lang="ko" data-theme="light">, admin.css, Paperlogy 400/500/600/700, NuqsAdapter, TooltipProvider, Toaster, robots noindex
src/app/(admin)/admin/login | mfa | no-access | unavailable /page.tsx
src/app/(admin)/admin/auth/callback/route.ts      OAuth PKCE exchange
src/app/(admin)/admin/export/[kind]/route.ts      POST → CSV (Origin checked)
src/app/(admin)/admin/(console)/layout.tsx        verifyAdmin(); sidebar shell; renders {children}{sheet}
  default.tsx (notFound), @sheet/default.tsx (null), @sheet/[...missing]/page.tsx (null; same slug as [...missing]), @sheet/(.)requests/[id]/page.tsx (intercepted Sheet)
  page.tsx (대시보드), checks, accounts, accounts/[id], connections, requests, requests/[id], deliveries, backorders,
  issues, chats, notices, remote-config, leads, audit, admins, account (내 계정), search, [...missing], error/not-found/loading
src/proxy.ts  matcher ['/admin', '/admin/:path*']
```

**Proxy.** In Next 16 the proxy runs on Node by default. It does the following:
- refreshes the session with `getClaims()`;
- passes `/admin/login`, `/admin/auth/*` and `/admin/unavailable` through;
- redirects requests without claims to `/admin/login?next=…`;
- signs out and redirects to `?reason=expired` once the session is older than 12 h (earliest `amr` timestamp);
- forwards an `x-admin-path` request header;
- sets `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`;
- rewrites every request to `/admin/unavailable` when the console is off.

The proxy redirects optimistically only. Every page, Server Action and Route Handler calls `verifyAdmin()` itself, because a proxy matcher does not protect Server Functions.

**Headers.**
- `next.config.ts` adds an `/admin/:path*` header rule after the global rule: noindex, no-store, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`.
- Production builds also get a CSP:
  - `default-src 'self'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`
  - `img-src 'self' data: blob: <supabase>`; `frame-src <supabase>`; `connect-src 'self'`
  - `form-action 'self' <supabase> https://accounts.google.com`
  - `frame-ancestors 'none'`; `base-uri 'self'`
- `robots.ts` disallows `/admin`.
- `experimental.authInterrupts` is not used. Forbidden states render in the page.

**Caching.** Nothing under `(admin)` uses `'use cache'`. Pages read cookies, so they render dynamically. `<AutoRefresh>` calls `router.refresh()` every 30 s while the tab is visible on the dashboard, 운영 점검 and the lists. It is off on 랜딩 문의, 채팅 열람 and 감사 로그.

## 5. Authentication and session

**Production sign-in:**
1. The 로그인 page has 아이디 and 비밀번호 fields only.
2. The server action maps the ID with `staffEmailFromId` and calls `signInWithPassword`.
3. On success it redirects to `safeNext(next)`. Only `/admin…` paths are allowed, never `//`.
4. `verifyAdmin()` calls `backoffice_whoami()` once per request (React `cache`) and routes on the result:

| Result | Destination |
|---|---|
| Not staff | `/admin/no-access` |
| MFA required at aal1 | `/admin/mfa?next=…` |
| RPC missing (`PGRST202`) | `/admin/unavailable?reason=not_installed` |
| Otherwise | the console |

**Local sign-in** uses `signInWithPassword`, only when the target is local. Seeded logins:

| Email | Password | Role |
|---|---|---|
| `admin@agentuncle.local` | `agentuncle-admin-local` | owner |
| `operator@agentuncle.local` | `agentuncle-operator-local` | operator |
| `viewer@agentuncle.local` | `agentuncle-viewer-local` | viewer |
| `spare@agentuncle.local` | `agentuncle-spare-local` | auth user, not staff |

**Cookies.** `@supabase/ssr` cookie options are `{ path: '/admin', sameSite: 'lax', httpOnly: true, secure: production }`. The PKCE verifier cookie also lives under `/admin`. There is no browser Supabase client.

**MFA.** Enrolment calls `mfa.enroll({ factorType: 'totp', friendlyName: '사입삼춘 운영' })`, shows the QR code and secret, then calls `challengeAndVerify`. Later sign-ins challenge the verified factor to reach aal2. On 2026-10-13 a read-only check confirmed the live project has TOTP enroll and verify on.

**Sign out.** "로그아웃" uses `scope: 'local'`. "모든 기기에서 로그아웃" in 내 계정 uses `scope: 'global'`.

**Staff onboarding:**
1. An owner creates the staff Auth user `<id>@staff.agentuncle.invalid` with a password through the Auth admin API (email confirmed).
2. The owner opens 운영 계정 → 운영 계정 추가 and looks the user up (`backoffice_lookup_user`: providers, email confirmed, app account).
3. The owner grants a role (`backoffice_grant_admin`, `require_mfa` on).
4. The staff member enrols TOTP at the next sign-in.

The first owner is seeded once from the SQL editor (§13).

## 6. Roles and permissions

| Capability | 열람자 viewer | 운영자 operator | 관리자 owner |
|---|---|---|---|
| Dashboard, 운영 점검, every list and dossier | PII masked | unmasked (dossier view audited) | unmasked |
| Search by phone tail, email, contact | - | ✓ | ✓ |
| Business document / photo files | - | ✓ reason + audit | ✓ |
| Chat list (metadata only) | ✓ | ✓ | ✓ |
| Chat transcript | - | ✓ reason + audit | ✓ |
| Document review (확인함 / 재제출 요청 / 초기화) | - | ✓ (확인함 requires the same person to have opened the file within 24 h; never on your own account) | ✓ |
| Suspend and restore an app account | - | ✓ non-staff | ✓ including staff |
| Notes, cases, lead status | - | ✓ | ✓ |
| Notices: info and important | - | ✓ create, schedule, publish, end | ✓ |
| Notices: critical | - | - | ✓ |
| Config: feature_flags, support | read | ✓ | ✓ |
| Config: maintenance, min_app_version, new keys, is_public | read | - | ✓ |
| CSV of requests, deliveries, receipts, issues, proposals (contact data stripped) | - | ✓ reason + audit | ✓ |
| CSV of accounts, leads (PII) | - | - | ✓ reason + audit |
| 감사 로그, 앱 작업 기록 | - | ✓ | ✓ |
| Audit chain verification | - | - | ✓ |
| 운영 계정 grant and revoke | names only | names only | ✓ (never on yourself; the last owner is protected) |

**Masking for viewers:**
- Phone numbers keep their last 4 digits and business numbers their last 3.
- Names keep their first character.
- Email becomes `x•••@domain`.
- An address keeps its first word.
- Lead messages and file names are hidden.

Invite codes are never returned to any role.

## 7. Security model

**Enforced in Postgres.** `run-checks.sh` verifies all of the following on local PG17 with real Supabase roles and seeded data: 131 checks with the migration applied twice, plus the app's 97 pgTAP assertions, all passing with the layer applied.

1. **App access is not widened.**
   - `saip_records` keeps its single `participant_read` policy and its select-only grant.
   - No `saip_*` function changes.
   - anon, authenticated and service_role get no privilege on any new table.
   - Clients get no `USAGE` on `backoffice_private`.
   - The Realtime publication is unchanged.
2. **Permissions.** Only `authenticated` can EXECUTE `backoffice_*`, and each function re-checks `backoffice_admins`: not revoked, role rank, and aal2 when `require_mfa` is set. Permission failures raise 42501 (HTTP 403). Validation failures raise P0001 with a Korean message that is safe to show as is.
3. **Readers.** Staff are never added to `readers`. Admin RPCs never call `saip_private.event`, `save_request` or `put`.
4. **Write guard.** `backoffice_guard_app_writes` on `saip_records`, plus a restrictive storage INSERT policy, stop a suspended account, or everyone during a write freeze, in the middle of a command, with the operator's message.
   - The command aborts atomically.
   - Staff bypass the guard only through a transaction-local flag, and only if they really are staff.
5. **Review locking.** Document review takes `saip_command`'s advisory key (`saip-actor-{uid}`). It cannot lose an update to a concurrent saveProfile.
6. **Immutable audit.** The audit log, reviews and notes reject UPDATE, DELETE and TRUNCATE. Each audit row's hash is sha256(prev ‖ row), covering action, target, reason, before/after, request hash, result and client.
7. **Replays.** A replay matches on sha256 of the full input, so stored payloads can stay redacted. Note bodies, internal notes and user messages are never kept in the log.
8. **File access.** A staff storage read needs operator+ plus an `attachment.view` audit row for that exact object within the last 10 minutes.
9. **Never returned:**
   - Drafts.
   - Chat bodies outside the audited transcript. Chat notice previews read "[채팅 알림]".
   - `saip_private.operations` args.

**Enforced in Next.js:**
- `verifyAdmin()` runs in every page, action and route.
- Actions validate input with zod and carry an `operationId` rendered by the Server Component.
- The export route checks `Origin`.
- `safeNext()` blocks open redirects.
- Admin cookies are httpOnly with path /admin.
- Admin HTML is never cached and is noindex.
- Raw Postgres messages are shown only for P0001 and 42501. Anything else reads "잠시 후 다시 시도해 주세요."
- Signed URLs last 60 s and render with `referrerPolicy="no-referrer"`.
- User text is never rendered as HTML.

**Accepted risks.** The mitigations are in §13.
- The login ban is direct SQL on `auth.users` and `auth.sessions`.
- After suspension, issued access tokens can still read for up to 3600 s.
- A superuser can rewrite the whole chain; mitigated by exporting the head hash weekly.
- An operator holding a fresh audited access can re-sign a URL within 10 minutes.
- Free-text notes and reasons are permanent.

## 8. Data layer (summary of the migration)

**Tables.** RLS is on for all of them, and no API role has any privilege on them.

| Table | Notes |
|---|---|
| `backoffice_admins` | |
| `backoffice_audit_log` | immutable, hash chain, unique (actor_id, operation_id) |
| `backoffice_account_reviews` | immutable |
| `backoffice_account_moderation` | |
| `backoffice_notes` | immutable |
| `backoffice_cases` | one open case per target, versioned |
| `backoffice_lead_status` | |
| `app_remote_config` | key, value, is_public, write_role, version |
| `app_notices` | versioned, never deleted |

The migration also adds the index `saip_records (collection, updated_at desc)`.

**Seed config.** These keys are seeded with `is_public` true:
- `maintenance`
- `min_app_version` (0.1.0 everywhere)
- `feature_flags` `{}`
- `support`

**Verification projection.** Only `backoffice_review_document` writes these keys on the accounts row: `verificationStatus` (verified | rejected | unverified), `verificationNote` (the user-facing re-submit message), `verifiedDocumentId`, `verifiedBusinessNumber`, `verificationReviewedAt`, and `version+1`. Partners never see them, because `public_profile` is a pick-list.

The derived `verification` state:

| State | Shown as | Meaning |
|---|---|---|
| `missing` | 미등록 | retailer without a document |
| `not_required` | 해당 없음 | uncle |
| `unverified` | 제출됨 · 검증 전 | |
| `verified` | 확인함 | the reviewed document and business number are still current |
| `stale` | 정보 변경 · 다시 확인 필요 | the document or business number changed after verification |
| `rejected` | 재제출 필요 | |

**RPCs.** All `public.*`. The role is the minimum required; "A" means audited.

| Group | RPC | Role | Notes |
|---|---|---|---|
| Identity | `backoffice_whoami()` | any authenticated | |
| Identity | `is_backoffice_admin(min_role)` | any authenticated | |
| Identity | `app_write_blocked()` | any authenticated | |
| Identity | `backoffice_can_read_object(name)` | any authenticated | used by policies |
| Read | `backoffice_overview(p_include_demo, p_days)` | viewer | kpi, labels, 14-day series, back-order aging, queue of 10 or fewer |
| Read | `backoffice_ledger_anomalies(p_include_demo)` | viewer | |
| Read | `backoffice_list_accounts(p_search, p_role, p_state, p_include_demo, p_sort, p_limit, p_offset)` | viewer | facets, missing fields |
| Read | `backoffice_get_account(p_account_id)` | viewer | A (account.view) for operator+ |
| Read | `backoffice_list_requests(p_labels[], p_attention, p_account_id, p_search, p_from, p_to, p_include_demo, p_sort, p_limit, p_offset)` | viewer | label tab counts, totals, lastEvent, recheckDays, recheckNoticeAt |
| Read | `backoffice_get_request(p_request_id)` | viewer | deliveries with round, receipts, proposals, issues, events (before/after for operator+), checks, photos, notes, cases |
| Read | `backoffice_list_records(p_collection, p_filter, p_status, p_request_id, p_account_id, p_include_demo, p_limit, p_offset)` | viewer | connections, deliveries, receipts, proposals, issues, events, notices, attachments, signupProgress |
| Read | `backoffice_list_conversations(…)` | viewer | metadata only |
| Read | `backoffice_get_conversation(a, b, reason, limit, before)` | operator, A | phone numbers masked |
| Read | `backoffice_attachment_access(id, reason)` | operator, A | |
| Read | `backoffice_search(q, limit)` | viewer | |
| Read | `backoffice_list_leads(p_status, p_search, p_include_suspect, …)` | viewer | A for operator+ |
| Read | `backoffice_list_config()` | viewer | |
| Read | `backoffice_list_notices(p_include_inactive)` | viewer | |
| Read | `backoffice_list_audit(…)` | operator | |
| Read | `backoffice_list_operations(…)` | operator | command names only |
| Read | `backoffice_list_admins()` | viewer | emails for owner only |
| Read | `backoffice_lookup_user(email)` | owner, A | |
| Read | `backoffice_export(kind, reason, from, to, include_demo)` | operator, A | owner for accounts and leads; 5,000 rows or fewer |
| Read | `backoffice_verify_audit_chain()` | owner | |
| Write | `backoffice_review_document` | operator | |
| Write | `backoffice_set_account_status` | operator | owner when the target is staff |
| Write | `backoffice_add_note` | operator | |
| Write | `backoffice_open_case` | operator | |
| Write | `backoffice_update_case` | operator | |
| Write | `backoffice_save_notice` | operator | owner for critical |
| Write | `backoffice_set_config` | operator | owner for owner keys, new keys and is_public |
| Write | `backoffice_grant_admin` | owner | |
| Write | `backoffice_revoke_admin` | owner | |
| Write | `backoffice_set_lead_status` | operator | |
| App | `app_bootstrap_config(p_platform, p_app_version)` | anon + authenticated | public config, maintenance, update gate, own account status, notices for own role in their live window |

Every write follows the same contract: `require_admin` → `replay(op, payload)` → validate → lock → write → audit → result, and a retry returns the stored result.

- Lists return `{ total, limit, offset, rows, facets? }` with a limit of 1 to 200.
- Live demo seed rows (`data.demoBatch`) are hidden unless `p_include_demo` is set. The UI flag is `demo=1`, shown only when the target is live.

## 9. Shared UI (summary; the normative detail is in the screens appendix)

- **Tokens.**
  - Surfaces: canvas `#EDECE3`, cards `#F5F4EE`, ink `#101010`, hairline `#D7D7D7`.
  - Accent: deep green `#0C483E` as primary, weak green at 12%.
  - Attention: `#D22030` tint, with text in `#B3192A`.
  - Charts: ordinal ramp `#86BC9E #549E7E #2E8C6B #1C6A55 #0C483E`.
  - Type: Paperlogy 400/500/600/700 as full KS X 1001 files.
  - Components: shadcn radix-mira. Icons: Phosphor only.
- **Shell.**
  - A 4px deep-green top rule.
  - A grouped, collapsible sidebar with count badges. Groups: 운영 현황, 계정·관계, 거래 흐름, 소통, 앱 제어, 웹사이트, 관리; the footer holds 내 계정 and 로그아웃.
  - The top bar has breadcrumbs, a "계정·요청·화면 찾기 ⌘K" button, an environment pill and a demo toggle when live.
  - Environment pill: "로컬 데이터 · 테스트" on local; "운영 DB · 읽기 전용" for viewers on live; "운영 DB · 변경 가능" for operators and owners on live.
- **⌘K palette.**
  - Built on cmdk.
  - Groups: 계정, 요청, 문의 (from `backoffice_search`), 화면, 바로가기, 최근 항목.
  - Hangul-safe debouncing.
  - `/admin/search` has scope tabs.
- **Tables.**
  - TanStack Table v8, paginated on the server.
  - All state lives in the URL through nuqs.
  - Chip filters with facet counts from the RPC, plus "필터 초기화".
  - 48px rows: a bold first line over a muted second line, numbers right-aligned.
  - Rows are links that open detail.
  - Lists are virtualized above 100 rows.
- **Status chips.** Always icon + label + tint:

| Tone | Icon | Used for |
|---|---|---|
| Attention | WarningCircle | 답변 필요, 문제 확인 중, 수량 차이, 재제출 필요, 정보 변경 · 다시 확인 필요, 이용 제한 |
| Normal | Clock | in-progress states |
| Done | CheckCircle | 수령 확인, 연결 완료, 확인함, 확정, 이용 중 |
| Ended | grey CheckCircle | 완료, 해결 확인 |
| Ended | grey XCircle | 거절, 취소 종료, 철회, 미등록 |

  Request labels mirror the app's `RequestRecord.statusLabel` word for word.
- **Formats.**
  - Times are KST through `@date-fns/tz`: "10월 13일 02:05", with a relative tooltip such as "12시간 전".
  - Durations read "3일째".
  - Numbers come before their unit: 2장, 3건, 4회차, 5곳, 6명.
  - D-day reads "오늘" or "{n}일 지남" / "{n}일 남음".
- **States.** Every list ships a skeleton, an empty state with a hint and "필터 초기화", an error state ("목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." + "다시 시도"), and a forbidden state ("이 화면은 {역할} 이상만 볼 수 있어요.").
- **Forms.**
  - Each form is an `ActionForm` with a hidden `operationId`.
  - The pending label is "저장하는 중…".
  - Success shows a toast plus aria-live text.
  - Failure keeps the input.
  - Destructive and app-wide actions use an AlertDialog with a question and a one-line consequence. Risky config needs typed confirmation.
- **Copy.**
  - 해요체; no exclamation marks, emoji or em-dashes.
  - The app's own nouns, joined with "·".
  - Never "고객"; never "삭제" for business records.
  - Be honest about limits.

## 10. Screens (index; full columns, filters, views, actions, states and copy in the appendix)

| § | Screen | Route | Minimum role | Data | Staff actions |
|---|---|---|---|---|---|
| 10.1 | 로그인 | `/admin/login` | public | Supabase Auth | Google (live) or password (local) |
| 10.2 | 2단계 인증 | `/admin/mfa` | signed in | MFA API | enrol, verify |
| 10.3 | 권한 없음 | `/admin/no-access` | signed in | whoami | sign out |
| 10.4 | 사용할 수 없음 | `/admin/unavailable` | public | env / whoami | - |
| 10.5 | 대시보드 | `/admin` | viewer | overview | - (6 KPI tiles link to filtered lists; 지금 확인할 일 queue; three charts) |
| 10.6 | 운영 점검 | `/admin/checks` | viewer | ledger_anomalies | - |
| 10.7 | 계정·가입 + dossier | `/admin/accounts`, `/admin/accounts/[id]` | viewer | list_accounts, get_account, attachment_access | document review, suspend/restore, notes, cases |
| 10.8 | 거래처 연결 | `/admin/connections` | viewer | list_records(connections) | - |
| 10.9 | 사입 요청 | `/admin/requests`, `/admin/requests/[id]` (Sheet + page) | viewer | list_requests, get_request | notes, cases, CSV |
| 10.10 | 전달·수령 | `/admin/deliveries` | viewer | list_records(deliveries) | - |
| 10.11 | 미송 재확인 | `/admin/backorders` | viewer | list_requests(attention) | - |
| 10.12 | 문제·정정 | `/admin/issues` | viewer | list_records(issues, proposals) | notes, cases |
| 10.13 | 채팅 열람 | `/admin/chats` | viewer (list) / operator (transcript) | list_conversations, get_conversation | - |
| 10.14 | 알림·공지 | `/admin/notices` | viewer / operator writes | list_records(notices), list_notices | save, publish, end notices |
| 10.15 | 원격 설정 | `/admin/remote-config` | viewer / operator / owner | list_config, list_audit | set config, 되돌리기 |
| 10.16 | 랜딩 문의 | `/admin/leads` | viewer / operator writes | list_leads | lead status, notes, CSV (owner) |
| 10.17 | 감사 로그 | `/admin/audit` | operator | list_audit, list_operations, verify_audit_chain | chain verify (owner) |
| 10.18 | 운영 계정 | `/admin/admins` | owner | list_admins, lookup_user | grant, revoke |
| 10.19 | 내 계정 | `/admin/account` | viewer | whoami, MFA API | enrol TOTP, sign out everywhere |

Every list screen also defines its views and tabs with counts, its filters, its sort, its search placeholder, its columns, its empty copy and its footer totals. All of that is in the appendix.

## 11. Remote config, notices, and the app-side follow-up

**Keys.**

| Key | Shape | Who can write | How it takes effect |
|---|---|---|---|
| `maintenance` | `{enabled, blockWrites, title, message, startsAt, endsAt}` | owner | `blockWrites` is enforced by the server now; the app gate needs §11.3 |
| `min_app_version` | `{ios\|android\|web: {minimum, recommended, storeUrl}, message}` | owner | semver is compared on the server |
| `feature_flags` | `{camelCase: boolean}` | operator | the app supplies its own defaults |
| `support` | `{kakaoChannel, email, phone, hours}` | operator | |

Validation mirrors `validate_config`. New keys and `is_public` changes are owner-only.

**Notices.** Each notice has an audience (retailer, uncle or all), a severity (info, important or critical), a window (`starts_at`, `ends_at`), an `active` flag, a `dismissible` flag and a `version`; editing bumps the version, so the app shows the notice again. Notices are delivered only through `app_bootstrap_config` and are never copied into `saip_records.notices`.

**App follow-up** (app repo, owned by the app team; nothing is written there now):
1. **`RemoteConfigStore`** in `lib/remote/remote_config.dart`.
   - `load()` calls `client.rpc('app_bootstrap_config', params: {'p_platform': 'ios'|'android'|'web', 'p_app_version': APP_VERSION})`.
   - The result is cached in Sembast `remotePreferences.config`.
   - It fails open, with a timeout of about 3 s.
   - It runs in parallel with `openRemoteServices` in `main.dart _open()` and is exposed as `AppServices.config`.
2. **`RemoteGate`** goes around the home navigator and checks, in order:
   - `update.required` → "업데이트가 필요해요" with a store button;
   - `maintenance.active`;
   - `account.status == 'suspended'` → "이용이 제한된 계정이에요" with 로그아웃.

   `update.recommended` shows a dismissible Home banner.
3. **Notices UI.** The highest-severity notice is a card at the top of Home. 알림 gets a pinned "운영 공지" section. Dismissal is stored per device as id → version, and non-dismissible notices cannot be closed.
4. **Refresh.** The config reloads on start (anon), after bootstrap (authenticated), on resume, and on every 15th 20-second poll. It also reloads after any P0001 from `saip_command`.
5. **Verification label** (`entry.dart:1175`):
   - "검증 완료" when verified, `verifiedDocumentId == documentId`, and the digits of `verifiedBusinessNumber` equal those of `businessNumber`;
   - "재제출 필요" plus `verificationNote` when rejected;
   - otherwise "제출됨 · 검증 전".
6. **Defaults.** Feature flags use explicit defaults at each call site. `support` becomes a row in 내 정보.

## 12. Testing strategy

| Layer | Tool | Coverage |
|---|---|---|
| DB behaviour | `supabase/backoffice/run-checks.sh` (BEGIN…ROLLBACK on the local stack, migration applied twice) | 131 checks: privileges, masking, audit throttling, storage gating, review, suspension, write freeze, idempotent replays, notices, config, staff, tamper and violation detection. `--app <dir>` also runs the app's 97 pgTAP assertions with the layer applied |
| DB in repo | pgTAP `supabase-local/supabase/tests/backoffice_test.sql` | self-contained port, for `sb.sh test db` and later the app repo |
| Unit | vitest (node, `src/**/*.test.ts`) | RPC error mapping; zod schemas against captured RPC fixtures; KST formatting and day ranges; label, tone and violation maps; CSV (BOM, quoting, formula guard); roles; `safeNext`; env guards; session age |
| E2E | Playwright `playwright.admin.config.ts` (desktop Chromium, shared `next dev` on 3100), `tests/e2e-admin/*` | auth and redirects, per-role nav, masking, URL state, request Sheet vs page, review with audited file open, suspension and freeze proven through a demo user's RPC, notices visible through `app_bootstrap_config`, chat reason gate, CSV, staff lifecycle, chain verify, axe |
| Security smoke | E2E and QA | no secrets in `.next/static`; httpOnly `/admin` cookies; noindex and no-store; no proxy or cookies on `/`; console off when the target is unset |
| Landing regression | `npm test`, `npm run test:e2e`, `npm run qa` | stays green after the route-group move |

Data comes from `supabase-local/scripts/reset.sh`: the demo seed plus the staff seed and sample staff activity. Tests that mutate data restore it afterwards.

## 13. Rollout, settings, open questions, risks

**Rollout:**
1. Build and verify everything locally.
2. The app team adds `20261011230000_landing_leads.sql` and then this migration to the app repo history. They run `supabase test db`, `db lint` (SECURITY DEFINER warnings are expected, as for `saip_*`), `smoke.py`, `db push --dry-run`, then `db push`.
3. Seed the first owner in the SQL editor, set the Vercel Production env, and deploy.
4. The owner enrols TOTP, then sets their own `require_mfa = true` in the SQL editor.
5. The app follow-up (§11.3) ships separately.

**Live settings** (read-only check, 2026-10-13):
- Google, Kakao and email providers are on.
- Signups are open, and email confirmation is required.
- TOTP is on.
- `jwt_exp` is 3600 and refresh rotation is on.
- The redirect allow-list already includes the Vercel production origin (`/**`) and the preview wildcard.
- `site_url` points at the Vercel website.

**Open questions** (each with the default this spec uses):
- **Staff overriding trade records:** no; notes and cases only.
- **Sign-in:** Google with separate staff accounts, plus TOTP.
- **Chat reading:** operators only, with a reason and an audit row; viewers see metadata. The privacy policy must say this.
- **"확인함":** a human checked the image, not NTS.
- **First app keys:** maintenance, then min_app_version, then notices, then feature flags and support.
- **Live demo data:** kept and hidden by default.

**Risks:**
- The guard adds two PK lookups to every `saip_records` write, so the app team must review it.
- The login ban is SQL against `auth.*`. The fallback is an Edge Function using `auth.admin.updateUserById`, with its secret kept in Supabase.
- Reads remain possible for up to 1 h after a suspension.
- Notes and reasons are permanent, which conflicts with PIPA erasure. Operators must keep personal data out of them.
- Mitigate chain rewrites with a weekly external copy of the head hash.
- Review serialization depends on the app keeping the `saip-actor-{uid}` advisory key.
- Lists scan per collection. That is fine at about 440 live rows, but needs keyset pagination later.
- Corrections can reopen completed requests. This is expected.
- Recheck reminders only exist while the uncle app is open.
- Every RPC name is visible to authenticated users, and calls return 403. Every new RPC must start with `require_admin()` and be covered by the privilege checks.
