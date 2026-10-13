# 사입삼춘 Backoffice (/admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Ship the v1 operator console under `/admin`. It reads and operates the 사입삼춘 app through audited, role-checked Postgres RPCs, uses no service-role key, and is built and verified entirely against the local Supabase stack.

**Architecture.**
- The landing moves into the `(site)` root layout, and the console becomes a second root layout, `(admin)`.
- `src/proxy.ts` refreshes the `@supabase/ssr` cookie session, for `/admin` only.
- A cached DAL, `verifyAdmin()`, gates every page, action and route.
- Server Components and Server Actions call typed, zod-validated wrappers around the `backoffice_*` RPCs in `supabase/backoffice/20261013090000_backoffice_admin_layer.sql`, which is applied locally as a migration copy.

**Tech Stack.**
- Next.js 16.4 (App Router, proxy.ts, Server Actions), React 19.3, TypeScript 5.9 strict
- Tailwind v4, shadcn 4.21 (radix-mira, Phosphor icons)
- `@supabase/ssr` 0.12.7 and supabase-js 2.117
- TanStack Table 8.21, nuqs 2.10
- date-fns 4.4 + `@date-fns/tz` 1.5
- cmdk 1.1, sonner 2.0, recharts 3.10, zod 4.6
- vitest 4, Playwright 1.64
- Supabase CLI 2.120 local stack in `supabase-local/`

**Spec.** Read all three before any task:
- `docs/superpowers/specs/2026-10-13-backoffice-design.md`
- the screen copy deck `docs/superpowers/specs/2026-10-13-backoffice-screens.md` (§9 and §10)
- the full step-by-step tasks with exact interfaces, `docs/superpowers/plans/2026-10-13-backoffice-tasks.md`

This plan file holds the constraints, the review focus, ownership, the graph and a summary of each task. The appendix holds the steps.

## Global Constraints

**Next.js**
- Next.js 16.4. Read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- Use `proxy.ts`, not middleware. `params` and `searchParams` are Promises.
- No `experimental.authInterrupts`. No `'use cache'` under `(admin)`.

**Dependencies.** Install these exact versions:

| Package | Version |
|---|---|
| @supabase/ssr | 0.12.7 |
| @tanstack/react-table | 8.21.3 |
| @tanstack/react-virtual | 3.14.17 |
| nuqs | 2.10.2 |
| date-fns | 4.4.0 |
| @date-fns/tz | 1.5.0 |
| cmdk | 1.1.1 |
| sonner | 2.0.8 |
| recharts | 3.10.1 |
| react-day-picker | 10.0.2 |
| radix-ui | 1.8.1 |
| class-variance-authority | 0.7.1 |
| tw-animate-css | 1.4.0 |
| server-only | 0.0.1 |
| shadcn (dev) | 4.21.4 |

No next-themes and no hugeicons.

**Security**
- No service-role or secret key in any web file, env file read by Next, or bundle. Use the publishable key only.
- The web app reads only `BACKOFFICE_SUPABASE_TARGET`, `BACKOFFICE_SUPABASE_URL` and `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY`, and only on the server. There is no browser Supabase client.
- Never touch the live project or its settings.
- Never write to, build in, or run git in `/Users/edmond104/conductor/workspaces/agent-uncle/lisbon`. Reading is fine.
- `supabase-local/scripts/sb.sh` is the only Supabase CLI entry point.
- Every page, Server Action and Route Handler under `(admin)` calls `verifyAdmin()` or `requireRole()` first.
- Every write passes `operationId`, a UUID rendered by the Server Component that renders the form.

**Styling**
- Never run `shadcn init`. Use a hand-written `components.json` plus `npx shadcn@4.21.4 add` only.
- `src/app/(site)/globals.css` stays byte-identical after the move.
- Colours:
  - Use the admin tokens from spec §9.
  - Green is the only key colour.
  - `#D22030` and `#B3192A` are for attention, in admin files only.
  - Never orange, lime or purple.
- Phosphor icons only.

**Copy and time**
- Korean copy is exact, from the screens appendix, in 해요체.
- No exclamation marks, emoji or em-dashes. Never "고객". App status strings are copied verbatim.
- All times are in KST, through `@date-fns/tz` or `Intl` with `timeZone: 'Asia/Seoul'`.

**Tests, ownership and commits**
- vitest covers pure modules only (`src/**/*.test.ts`, node). UI is covered by Playwright in `tests/e2e-admin`.
- Each task must pass `npm run lint`, `npm run typecheck`, `npm test` and its own e2e specs.
- File ownership is strict. Touch only the files listed for your task, and report any needed cross-file change to the owning task.
- Commits are conventional (`feat(admin)`, `feat(db)`, `test(admin)`), and each ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Operation id rotation.** An operator submits a form successfully, then submits a different value from the same open sheet. The second submit must succeed, because the re-render after `revalidatePath` delivers a fresh `operationId`. A reused id with a different payload must map to "이미 처리된 작업이에요. 화면을 새로고침한 뒤 다시 시도해 주세요." Test: WP-07 e2e "two different notes in a row", and WP-03 `mapRpcError`.
2. **Session expiry mid-action.** When the refresh fails, the action shows "로그인이 만료됐어요. 다시 로그인해 주세요." with a link to `/admin/login?next=…` and keeps the typed input. It never shows a generic error. Test: WP-03 unit (PGRST301 or 401), and WP-11 e2e (delete cookies, then submit).
3. **KST day boundaries.** Vercel runs in UTC, and operators may be abroad. Picking the day 2026-10-13 must send `[2026-10-12T15:00:00.000Z, 2026-10-13T15:00:00.000Z)`. This applies to filters, the "오늘" views and CSV ranges. Test: WP-03 unit `kstDayRange`.
4. **Concurrent staff edits.** On a notice, config key or case, the second save shows the DB's P0001 ("다른 운영자가 … 최신 내용을 확인해 주세요."), keeps the input, and offers "최신 내용 불러오기". Test: WP-09 notice conflict e2e, and WP-10 config conflict e2e.
5. **Hangul IME in search.** Nothing fires while `isComposing`. The final query is sent after `compositionend`, and the last syllable is never dropped. Test: WP-04 palette e2e, and WP-06 list search e2e.

## File ownership

`(console)/…` means `src/app/(admin)/admin/(console)/…`.

| Owner | Files |
|---|---|
| WP-00 | `package.json` (including script `test:e2e:admin`); `package-lock.json`; `components.json`; `next.config.ts`; `src/app/robots.ts`; `scripts/qa/no-banned-colors.mjs` (+ test); `src/app/(site)/**` (moved); `src/app/(admin)/{layout.tsx,admin.css,fonts.ts,fonts/*}`; `src/components/admin/ui/**`; `src/hooks/admin/**`; `src/lib/admin/utils.ts`; `src/lib/admin/theme.test.ts`; path comments in `src/lib/{device,motion,z,og-text}.ts`, `SmoothScroll.tsx` and `scripts/fonts/og-fonts.mjs` |
| WP-01 | `supabase-local/supabase/migrations/20261013090000_backoffice_admin_layer.sql`; `supabase-local/supabase/tests/backoffice_test.sql`; `supabase-local/seed/backoffice-staff.mjs`; `supabase-local/scripts/{reset.sh,verify-schema.mjs,sync-migrations.sh,check-api.mjs}`; `supabase-local/README.md`; `supabase/README.md`; `src/lib/admin/database.types.ts`. The files in `supabase/backoffice/**` are canonical: change them only together with `run-checks.sh` |
| WP-02 | `src/proxy.ts`; `src/lib/admin/{env,roles,session,dal}.ts`; `src/lib/admin/{supabase,auth}/**`; `src/app/(admin)/admin/{login,mfa,no-access,unavailable,auth}/**`; `src/components/admin/auth/**`; `playwright.admin.config.ts`; `tests/e2e-admin/{global-setup.ts,fixtures.ts,helpers/rest.ts,auth.spec.ts}` |
| WP-03 | `src/lib/admin/rpc/**`; `src/lib/admin/{actions,shared-actions,format,labels,csv,search-params,operation-id}.ts`; `src/components/admin/{data-table,states,forms,panels,common,export}/**`; `src/app/(admin)/admin/export/**`; `scripts/admin/capture-rpc-fixtures.mjs` |
| WP-04 | `(console)/{layout,error,not-found,loading}.tsx`; `(console)/default.tsx`; `(console)/@sheet/{default.tsx,[...missing]/page.tsx}`; `(console)/[...missing]/**`; `(console)/{search,account}/**`; `src/lib/admin/nav.ts`; `src/components/admin/shell/**`; `tests/e2e-admin/shell.spec.ts` |
| WP-05 | `(console)/page.tsx`; `(console)/checks/**`; `src/components/admin/{dashboard,checks}/**`; `tests/e2e-admin/dashboard.spec.ts` |
| WP-06 | `(console)/{accounts,connections}/**`; `src/components/admin/{accounts,connections}/**`; `tests/e2e-admin/accounts.spec.ts` |
| WP-07 | `(console)/requests/**`; `(console)/@sheet/(.)requests/**`; `src/components/admin/requests/**`; `tests/e2e-admin/requests.spec.ts` |
| WP-08 | `(console)/{deliveries,backorders,issues}/**`; `src/components/admin/{deliveries,backorders,issues}/**`; `tests/e2e-admin/trade-flow.spec.ts` |
| WP-09 | `(console)/{chats,notices,leads}/**`; `src/components/admin/{chats,notices,leads}/**`; `tests/e2e-admin/{chats,notices,leads}.spec.ts` |
| WP-10 | `(console)/{remote-config,audit,admins}/**`; `src/components/admin/{remote-config,audit,admins}/**`; `tests/e2e-admin/{remote-config,audit,admins}.spec.ts` |
| WP-11 | `tests/e2e-admin/{smoke,security,a11y}.spec.ts`; `README.md` (admin section) |

## Dependency graph

```
WP-00 ──┐
        ├─► WP-02 ─► WP-03 ─► WP-04 ─► { WP-05, WP-06, WP-07, WP-08, WP-09, WP-10 } ─► WP-11
WP-01 ──┘
```

WP-00 and WP-01 run in parallel. WP-05 through WP-10 run in parallel.

## Tasks (summary; full TDD steps, code contracts and test lists in the tasks appendix)

### WP-00 Foundation
**What.** Move the landing into `(site)` with `git mv`, changing only the relative font import. Then build the admin side:
- pinned dependencies;
- a hand-written `components.json`;
- the `(admin)` root layout, with noindex metadata and the NuqsAdapter, TooltipProvider and Toaster providers;
- `admin.css` (source(none) with explicit `@source`; tokens from spec §9; light theme only);
- Paperlogy 400/500/600/700 in full KS X 1001 builds;
- the shadcn components (checkbox gets an indeterminate glyph, CommandDialog gets a `<Command>` wrapper, sonner drops next-themes);
- `/admin` headers and a production-only CSP in `next.config.ts`;
- `robots.ts` disallowing `/admin`;
- an admin-path exemption for the app reds in the QA colour script.

**Produces.** `cn`, `@/components/admin/ui/*`, and the CSS variables `--status-*` and `--chart-1..5`.

**Accept when:**
- The landing CSS is byte-identical, and the landing unit, e2e and QA runs pass.
- `next build` passes.
- No admin tokens appear in landing CSS chunks, and no landing tokens appear in admin chunks.
- There is no hugeicons or next-themes.

### WP-01 Database layer on the local stack
**What.**
- Run `supabase/backoffice/run-checks.sh --app <tmp copy of the app tests>`.
- Write a self-contained pgTAP port in `supabase-local/supabase/tests/backoffice_test.sql`.
- Copy the migration byte for byte into `supabase-local/supabase/migrations/`.
- Write `backoffice-staff.mjs`. It creates owner `admin@`, `operator@`, `viewer@` and the non-staff `spare@agentuncle.local` (all with confirmed emails and `require_mfa` false). It adds sample activity through the real RPCs: 2 notes, 1 case, 2 lead statuses, 1 draft notice and 1 live notice, and a feature flag.
- Hook the staff script into `reset.sh`.
- Teach `verify-schema.mjs` about the known pending delta, give `sync-migrations.sh` a byte-equality check, and add the new checks to `check-api.mjs`.
- Generate `src/lib/admin/database.types.ts` with `sb.sh gen types typescript --local`.
- Update the docs.

**Accept when:**
- After `reset.sh`, all four logins work and the chain verifies.
- `run-checks.sh`, `sb.sh test db`, `check-api.mjs` and `verify-schema.mjs` (exit 0, pending list printed) all pass.
- Live is untouched.

### WP-02 Auth, session, DAL, e2e harness
**What.** Spec §3, §5 and §10.1 to §10.4, and the interfaces in the tasks appendix:
- the pure modules `env`, `roles` and `session`, which hold `safeNext`, a 12 h max age from `amr`, and the target and URL guards;
- `whoami` with zod;
- `createAdminServerClient`, with httpOnly cookies on `/admin`, `sameSite lax`, and the forwarded client headers;
- `updateAdminSession` and `src/proxy.ts`, which forward `x-admin-path`;
- the DAL: `getAdminGate`, `verifyAdmin` and `requireRole`;
- the auth server actions: Google, local password, TOTP verify and enrol, sign out (local and global);
- the pages for 로그인, 2단계 인증, 권한 없음 and 사용할 수 없음, plus the OAuth callback;
- the Playwright admin harness: config, global setup, `asRole` fixtures and REST/psql helpers.

**Accept when:**
- The unit tests and `auth.spec.ts` pass.
- Cookies are httpOnly on `/admin`.
- `/` sets no Supabase cookie.
- There is no `createBrowserClient` and no `NEXT_PUBLIC_BACKOFFICE_*` read anywhere.

### WP-03 RPC contract layer and shared UI kit
**What.**
- `callRpc` and `mapRpcError` (forbidden, invalid, conflict, not_installed, unauthenticated, network, unknown).
- zod schemas and typed `rpc.*` wrappers for every RPC in spec §8, with camelCase arguments mapped to `p_snake`.
- The shared modules: `ActionState`/`runAdminAction`, shared actions (notes, cases, attachment signed URL, search), `format` (KST), `labels` (every map in the screens appendix), `csv` (BOM and formula guard), nuqs parsers, and the operation id.
- The kit components: DataTable and its toolbar parts, states, chips, ActionForm, Reason/Confirm dialogs, Notes/Case panels, AttachmentViewer, ExportDialog.
- The export Route Handler, with an Origin check, Korean headers, a filename and no-store.
- The fixture-capture script.

**Accept when:**
- Every fixture parses.
- The unit tests for core, format, labels, csv and actions pass.
- The build passes.
- No secrets appear in `src`.

### WP-04 Console shell
**What.**
- The `(console)` layout: `verifyAdmin`, badges from `overview`, the sidebar, the top bar with the environment pill, the demo toggle, the 4px rule, the skip link, and the `{sheet}` slot.
- The error, not-found and loading states, and `[...missing]`.
- `nav.ts`, with exactly the spec §9 groups and roles.
- The cmdk ⌘K palette (Hangul-safe, with recent items).
- The `/admin/search` page and 내 계정.

**Accept when** `nav.test.ts` and `shell.spec.ts` pass, including Hangul composition and the admin not-found page.

### WP-05 대시보드 and 운영 점검
**What.** Spec §10.5 and §10.6: KPI tiles linking to filtered lists, the 지금 확인할 일 queue, charts following the dataviz rules (14-day bars, stage stack from `toStages`, back-order aging), the side summary, a range toggle, the anomaly table with kind chips, and auto-refresh.

**Accept when** `stages.test.ts` and `dashboard.spec.ts` pass, including the detection of an injected ledger violation (restored afterwards).

### WP-06 계정·가입 and 거래처 연결
**What.** Spec §10.7 and §10.8:
- the list, with its facet rail, views, search, sort and columns;
- the dossier tabs;
- the 서류 flow: ReasonDialog, then a signed-URL preview, then the review form;
- suspend and restore dialogs;
- the notes and cases panels;
- the connections list.

**Accept when** `signup.test.ts` and `accounts.spec.ts` pass. That spec covers masking per role, URL filters surviving a reload, review leaving an audit row, suspension blocking a demo user's `saip_command` and restore unblocking it, and Hangul search.

### WP-07 사입 요청
**What.** Spec §10.9:
- the tabs (with counts) mapped from `REQUEST_TABS`, `view=attention`, the filters, search, sort, columns and the footer totals;
- operator CSV export;
- the intercepted Sheet and the full page sharing `RequestDetail`;
- the ledger tiles and the violation banner;
- the timeline with `ledgerDiff`;
- the delivery, proposal, issue, photo and chat-link tabs;
- notes and cases.

**Accept when** `ledger-diff.test.ts` and `requests.spec.ts` pass. That spec covers tab counts, the Sheet keeping scroll, a direct URL rendering the full page, before/after visibility per role, CSV, and two notes in a row.

### WP-08 전달·수령, 미송 재확인, 문제·정정
**What.** Spec §10.10 to §10.12: the deliveries views (with round, wait time and 정정됨), the back-order views (D-day, 재확인 알림 column, aging chart), and the 3-pane issue and proposal triage with its properties panel and read-only notes.

**Accept when** `issue-kind.test.ts` and `trade-flow.spec.ts` pass.

### WP-09 채팅 열람, 알림·공지, 랜딩 문의
**What.**
- Spec §10.13: the conversation list and a reason-gated transcript returned from a Server Action into client state. It is never put in a URL or the RSC payload.
- Spec §10.14: notice history, and the notice editor (preview, publish, end), with critical notices for owners only.
- Spec §10.16: leads with views, a sheet, status and assignee, notes, and owner CSV.

**Accept when** `notice-form.test.ts` and `chats.spec.ts`, `notices.spec.ts`, `leads.spec.ts` pass. They cover masked phones, the audit row, notice visibility per role through `app_bootstrap_config`, and the version conflict.

### WP-10 원격 설정, 감사 로그, 운영 계정
**What.**
- Spec §10.15: config editors with zod mirrors of `validate_config`, typed confirmations, and history with 되돌리기.
- Spec §10.17: the audit and operations tabs, plus chain verify for owners.
- Spec §10.18: staff lookup, grant and revoke.

**Accept when** `config-forms.test.ts` and `remote-config.spec.ts`, `audit.spec.ts`, `admins.spec.ts` pass. They cover the maintenance freeze proven through a demo user's RPC and reverted, the version conflict, and the staff lifecycle with `spare@`.

### WP-11 Integration, security, accessibility, docs
**What.**
- A smoke spec for each role and route.
- A security spec:
  - no secrets in `.next/static`;
  - the headers and cookies;
  - Origin 403 on export;
  - the console off under `next start` without the BACKOFFICE vars;
  - expiry mid-action.
- axe on every route.
- The README admin section.
- A full green run on a fresh reset: lint, typecheck, unit, build, landing e2e, admin e2e, `npm run qa`, `run-checks.sh` and `check-api.mjs`.

**Accept when** all of that is green and the landing is unchanged.

## Self-review
- **Spec coverage.** Every spec section maps to a task: §3 to §5 go to WP-00 and WP-02; §8 to WP-03; §9 to WP-00, WP-03 and WP-04; §10.x to WP-02 and WP-05 through WP-10; §12 to WP-01, WP-03 and WP-11. §11.3 and §13 are user actions. Nothing is unassigned.
- **Types.** `RpcResult`, `RpcError`, `ActionState`, `AdminRole`, `AdminSession` and `AdminGate` are each defined once (WP-02 and WP-03) and only consumed afterwards.
- **Review Focus.** Each of the five items has an owning test.

## Execution handoff
The plan is complete. Please review it. Subagent-driven execution is recommended: there are 12 packages, the module tasks share the WP-02 and WP-03 contracts, and a shipped mistake would affect a console on the live, shared database. That makes a fresh reviewer per package worth the cost.
