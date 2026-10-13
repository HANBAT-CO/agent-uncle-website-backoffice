# 사입삼춘 Backoffice: Task Steps (plan appendix)

Companion to `docs/superpowers/plans/2026-10-13-backoffice-build-plan.md` (goal, global constraints, review focus, file ownership, dependency graph). This appendix holds the full TDD steps, exact interfaces and acceptance for every work package. Spec: `docs/superpowers/specs/2026-10-13-backoffice-design.md` + `docs/superpowers/specs/2026-10-13-backoffice-screens.md`. Paths written `(console)/…` mean `src/app/(admin)/admin/(console)/…`.

### Task WP-00: Foundation (deps, route groups, admin theme, shadcn kit)

**Files:**
- Modify: `package.json`, `package-lock.json`, `next.config.ts`, `src/app/robots.ts`, `scripts/qa/no-banned-colors.mjs`
- Move with `git mv` (content unchanged except the relative font import in the layout): `src/app/layout.tsx` → `src/app/(site)/layout.tsx`; `src/app/page.tsx` → `src/app/(site)/page.tsx`; `src/app/globals.css` → `src/app/(site)/globals.css`; `src/app/opengraph-image.tsx` → `src/app/(site)/opengraph-image.tsx`. Update the path comments that mention the old paths in `src/lib/{device,motion,z,og-text}.ts`, `src/components/motion/SmoothScroll.tsx`, `scripts/fonts/og-fonts.mjs` (comments only).
- Create: `components.json`, `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin.css`, `src/app/(admin)/fonts.ts`, `src/app/(admin)/fonts/paperlogy-{400,500,600,700}.woff2`, `src/lib/admin/utils.ts`, `src/components/admin/ui/*` (via `shadcn add`), `src/hooks/admin/use-mobile.ts`, `src/lib/admin/theme.test.ts`

**Interfaces:**
- Produces:
  - `cn(...inputs): string` from `@/lib/admin/utils`
  - shadcn components under `@/components/admin/ui/*`: button, badge, card, table, input, select, dropdown-menu, sheet, dialog, alert-dialog, command, sidebar, skeleton, tooltip, tabs, separator, checkbox, popover, calendar, chart, sonner, breadcrumb, avatar, toggle-group, toggle, label, textarea, empty, kbd, field, input-group, switch, radio-group, scroll-area
  - The admin root layout providers (NuqsAdapter, TooltipProvider, Toaster)
  - CSS tokens from spec §9 as CSS variables: `--status-attention-*`, `--status-normal-*`, `--status-neutral-*`, `--chart-1..5`

- [ ] **Step 1: Baseline.** Run `npm test`, `npm run typecheck` and `npm run lint`, and record that they pass. Save `sha256sum src/app/globals.css` for later.
- [ ] **Step 2: Move the landing.** `mkdir -p "src/app/(site)"`, then run the four `git mv` commands. In `(site)/layout.tsx` change `./fonts/paperlogy` to `../fonts/paperlogy`. Run `npm run typecheck && npm test`. Expected: PASS. Run `npx playwright test tests/e2e/smoke.spec.ts --project=desktop`. Expected: PASS.
- [ ] **Step 3: Write the failing test** `src/lib/admin/theme.test.ts`. It reads `src/app/(admin)/admin.css` as text and asserts:
  - it starts with `@import "tailwindcss" source(none);`
  - it declares `--primary: #0c483e`, `--background: #edece3` and `--status-attention-fg: #b3192a`
  - it has no hex in the banned families: run the same HSV check as `scripts/qa/no-banned-colors.mjs`, importing its exported helper. Export `hueFamily(hex)` from that script.
  - the landing `globals.css` hash equals the Step 1 hash

  Run `npx vitest run src/lib/admin/theme.test.ts`. Expected: FAIL (the file is missing).
- [ ] **Step 4: Install the pinned deps** and add the script `"test:e2e:admin": "playwright test -c playwright.admin.config.ts"`. `npm i -E @supabase/ssr@0.12.7 @tanstack/react-table@8.21.3 @tanstack/react-virtual@3.14.17 nuqs@2.10.2 date-fns@4.4.0 @date-fns/tz@1.5.0 cmdk@1.1.1 sonner@2.0.8 recharts@3.10.1 react-day-picker@10.0.2 radix-ui@1.8.1 class-variance-authority@0.7.1 tw-animate-css@1.4.0 server-only@0.0.1` and `npm i -D -E shadcn@4.21.4`.
- [ ] **Step 5: Write `components.json` by hand.** Copy it from `.context/scratch-backoffice/components.json`, with `"utils": "@/lib/admin/utils"`. Create `src/lib/admin/utils.ts` exporting `cn` (clsx + tailwind-merge).
- [ ] **Step 6: Create `src/app/(admin)/admin.css`** from spec §9 tokens. Use `.context/scratch-backoffice/src/app/(admin)/admin.css` as the starting point, but remove the `[data-theme="dark"]` block: v1 is light only.
  - `@import "tailwindcss" source(none); @import "tw-animate-css"; @import "shadcn/tailwind.css";`
  - `@source "../../components/admin"; @source "../../lib/admin"; @source "./";`
  - Body: `font-family: var(--font-paperlogy)`, `word-break: keep-all`, tabular digits not needed (Paperlogy digits are fixed-width).
- [ ] **Step 7: Fonts.** Generate `paperlogy-500.woff2` and `paperlogy-600.woff2` from `.context/brief/assets/fonts/Paperlogy-5Medium.ttf` and `-6SemiBold.ttf`, with the same unicode set as the existing full `src/app/fonts/paperlogy-400.woff2`. Run `uv run --no-project --with fonttools --with brotli pyftsubset <ttf> --unicodes-file=<set derived from paperlogy-400.woff2 cmap> --flavor=woff2 --layout-features='*' --output-file=...`. Copy the 400 and 700 full files. `fonts.ts` declares `localFont` with all four weights, variable `--font-paperlogy`, `display: 'swap'`, fallback `['Apple SD Gothic Neo','Malgun Gothic','system-ui','sans-serif']`.
- [ ] **Step 8: Admin root layout.** `<html lang="ko" className={paperlogy.variable} data-theme="light">`, `metadata = { title: { default: '사입삼춘 운영', template: '%s | 사입삼춘 운영' }, robots: { index: false, follow: false } }`, `viewport.themeColor '#EDECE3'`. Body: `<NuqsAdapter><TooltipProvider delayDuration={300}>{children}</TooltipProvider></NuqsAdapter><Toaster position="bottom-right" />`.
- [ ] **Step 9: shadcn components.** Run `npx shadcn@4.21.4 add <list above>`. Then fix:
  - checkbox: add an indeterminate `Minus` glyph
  - command: CommandDialog renders `<Command>` around its children
  - sonner: remove next-themes, fixed `theme="light"`
  - remove any `@hugeicons` imports or packages; Phosphor only

  Confirm `git diff --stat src/app/(site)/globals.css` is empty.
- [ ] **Step 10: next.config.ts.** Append a header rule for `source: '/admin/:path*'` after the global one:
  - `X-Robots-Tag noindex, nofollow`, `Cache-Control private, no-store`, `X-Frame-Options DENY`, `Referrer-Policy no-referrer`
  - when `process.env.NODE_ENV === 'production'`, the CSP from spec §4, using the origin of `BACKOFFICE_SUPABASE_URL` (skip CSP if unset)

  `robots.ts`: `rules: { userAgent: '*', allow: '/', disallow: '/admin' }`. `no-banned-colors.mjs`: exempt the APP_REDS rule (and only the red hue family) for paths under `src/app/(admin)/`, `src/components/admin/`, `src/lib/admin/`. Add a case to `no-banned-colors.test.mjs` showing that orange inside an admin path still fails.
- [ ] **Step 11: Verify.** Run `npx vitest run src/lib/admin/theme.test.ts`. Expected: PASS. Then run `npm run lint && npm run typecheck && npm test && npm run build && node scripts/qa/no-banned-colors.mjs && node scripts/qa/no-dash.mjs`. Expected: all PASS. Run `npm run test:e2e -- --project=desktop`. Expected: the landing suite passes. `curl -sI localhost:3100/` shows no `X-Robots-Tag: noindex`.
- [ ] **Step 12: Commit.** `refactor(site): move landing into (site) root layout` and `feat(admin): add admin root layout, theme and component kit`.

**Acceptance:**
- The landing is byte-identical in CSS, and its unit, e2e and QA scripts pass.
- `next build` passes.
- The admin CSS chunk has no landing tokens, and the landing chunks have no `--sidebar`/`--status-` tokens. Check with `grep` on `.next/static/css`.
- No hugeicons and no next-themes.

### Task WP-01: Database layer on the local stack, staff seed, generated types

**Files:**
- Already present (do not edit without re-running the checks): `supabase/backoffice/20261013090000_backoffice_admin_layer.sql`, `supabase/backoffice/backoffice_checks.sql`, `supabase/backoffice/run-checks.sh`
- Create: `supabase-local/supabase/migrations/20261013090000_backoffice_admin_layer.sql` (byte copy), `supabase-local/supabase/tests/backoffice_test.sql`, `supabase-local/seed/backoffice-staff.mjs`, `src/lib/admin/database.types.ts` (generated)
- Modify: `supabase-local/scripts/reset.sh`, `supabase-local/scripts/verify-schema.mjs`, `supabase-local/scripts/sync-migrations.sh`, `supabase-local/scripts/check-api.mjs`, `supabase-local/README.md`, `supabase/README.md`

**Interfaces:**
- Produces:
  - The local DB with the backoffice layer.
  - Staff logins (spec §5): `admin@agentuncle.local` (owner), `operator@agentuncle.local` / `agentuncle-operator-local`, `viewer@agentuncle.local` / `agentuncle-viewer-local`, and `spare@agentuncle.local` / `agentuncle-spare-local` (auth user, not staff). All have `require_mfa=false` and confirmed emails.
  - `Database` type in `src/lib/admin/database.types.ts` (`Functions` contains every `backoffice_*`).
- Consumes: `supabase-local/scripts/{sb.sh,psql.sh}` and `.env.seed.local`. The local service-role key is for seed scripts only; never import it into `src/`.

- [ ] **Step 1: Behaviour checks first.** Run `supabase/backoffice/run-checks.sh --app <tmpdir>`. Before that, copy the app's `supabase/tests/*.sql` (read-only source) into `<tmpdir>`. Expected: `ALL CHECKS PASSED`, `workspace_test.sql: 65 ok`, `signup_validation_test.sql: 32 ok`.
- [ ] **Step 2: Write the failing pgTAP test** `supabase-local/supabase/tests/backoffice_test.sql`. Port `backoffice_checks.sql` to pgTAP style: `begin; create extension if not exists pgtap with schema extensions; select no_plan(); … select * from finish(); rollback;`. Use `ok/is/throws_ok/lives_ok`. Make it self-contained so it also runs on `reset.sh --empty` and later in the app repo:
  - create its own app fixtures the way the app's `workspace_test.sql` does: auth users, storage objects, then `saip_command` bootstrap, chooseRole, registerAttachment, saveProfile, connect, respondConnection, saveDraft, sendDraft and sendMessage
  - put staff fixtures at fixed UUIDs with `@staff.test` emails

  Run `supabase-local/scripts/sb.sh test db`. Expected: FAIL (functions missing).
- [ ] **Step 3: Apply locally.** `cp supabase/backoffice/20261013090000_backoffice_admin_layer.sql supabase-local/supabase/migrations/`, then run `supabase-local/scripts/reset.sh --empty` and `supabase-local/scripts/sb.sh test db`. Expected: PASS for `backoffice_test.sql`.
- [ ] **Step 4: Staff seed `backoffice-staff.mjs`** (idempotent):
  1. Read `supabase-local/.env.seed.local`.
  2. Create the missing auth users with the GoTrue admin API (`email_confirm: true`).
  3. Upsert `backoffice_admins` through `psql.sh`: admin@ owner '대표', operator@ operator '운영 담당', viewer@ viewer '조회 담당', all `require_mfa false`.
  4. Sign in as operator and owner with the publishable key, and generate sample activity through the real RPCs:
     - 2 notes on requests
     - 1 case
     - 2 lead statuses
     - 1 draft notice and 1 live info notice for 소매업자
     - `feature_flags {"newRequest": true}`

  In `reset.sh`, after `node "$here/../seed/demo.mjs"`, add `node "$here/../seed/backoffice-staff.mjs"`.
- [ ] **Step 5: Parity tooling.**
  - `verify-schema.mjs`: treat the objects created by the backoffice migration as a known pending delta (schema `backoffice_private`; `public.backoffice_*`; `app_remote_config`; `app_notices`; functions `is_backoffice_admin`, `app_write_blocked`, `app_bootstrap_config`, `backoffice_*`; trigger `backoffice_guard_app_writes`; storage policies `backoffice_attachment_read`, `app_attachment_write_guard`; index `saip_records_collection_updated`; migration version `20261013090000`). Print them under "pending, not on live" and still exit 0 when nothing else differs.
  - `sync-migrations.sh`: skip `20261013090000_*`, because its source is `supabase/backoffice/` and it must be byte-equal to it. Add that comparison.
  - `check-api.mjs`, add checks:
    - the owner's `backoffice_whoami` is ready
    - a demo app user gets HTTP 403 from `rpc/backoffice_overview`
    - anon gets 401 or 403 from `rpc/backoffice_overview`
    - anon `rpc/app_bootstrap_config` returns 200 with `maintenance`
    - `select * from backoffice_audit_log` via REST as the owner returns 401, 403 or 404 (no table access)
- [ ] **Step 6: Types.** Run `supabase-local/scripts/sb.sh gen types typescript --local --schema public > src/lib/admin/database.types.ts`. Add a header comment `// generated by WP-01; regenerate after any backoffice SQL change`.
- [ ] **Step 7: Docs.** In `supabase-local/README.md` add the staff logins, the layer, `run-checks.sh` and the fact that it is a pending delta. In `supabase/README.md` add the "Backoffice layer (proposed)" rollout steps from spec §13.
- [ ] **Step 8: Verify.** Run `supabase-local/scripts/reset.sh`, then `node supabase-local/scripts/check-api.mjs` (all pass), `node supabase-local/scripts/verify-schema.mjs` (exit 0, pending list printed), `supabase/backoffice/run-checks.sh` (all pass) and `npm run typecheck`. Commit `feat(db): apply proposed backoffice layer to the local stack with staff seed`.

**Acceptance:**
- After `reset.sh`: the local DB has the layer, 4 staff logins work, the sample activity exists, and `backoffice_verify_audit_chain()` as the owner returns ok.
- Every check script passes. Live is untouched: verify-schema used only the read-only endpoint.
- The migration copy is byte-identical to `supabase/backoffice/`.

### Task WP-02: Auth, session and DAL

**Files:**
- Create: `src/proxy.ts`, `src/lib/admin/env.ts`, `src/lib/admin/roles.ts`, `src/lib/admin/session.ts`, `src/lib/admin/dal.ts`, `src/lib/admin/supabase/server.ts`, `src/lib/admin/supabase/proxy.ts`, `src/lib/admin/auth/whoami.ts`, `src/lib/admin/auth/actions.ts`, `src/app/(admin)/admin/login/page.tsx`, `src/app/(admin)/admin/mfa/page.tsx`, `src/app/(admin)/admin/no-access/page.tsx`, `src/app/(admin)/admin/unavailable/page.tsx`, `src/app/(admin)/admin/auth/callback/route.ts`, `src/components/admin/auth/{AuthCard,GoogleSignInButton,PasswordSignInForm,MfaChallengeForm,MfaEnrollForm,SignOutButton}.tsx`
- Create (the e2e harness every later task uses): `playwright.admin.config.ts`, `tests/e2e-admin/global-setup.ts`, `tests/e2e-admin/fixtures.ts`, `tests/e2e-admin/helpers/rest.ts`
- Test: `src/lib/admin/{env,roles,session}.test.ts`, `src/lib/admin/auth/whoami.test.ts`, `tests/e2e-admin/auth.spec.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/admin/env.ts  (import 'server-only')
export type BackofficeTarget = 'local' | 'live';
export type BackofficeEnv =
  | { enabled: true; target: BackofficeTarget; url: string; publishableKey: string }
  | { enabled: false; reason: 'disabled' | 'misconfigured'; detail: string };
export function readBackofficeEnv(env: Record<string, string | undefined>): BackofficeEnv; // pure, tested
export function getBackofficeEnv(): BackofficeEnv; // readBackofficeEnv(process.env)

// src/lib/admin/roles.ts  (client-safe)
export type AdminRole = 'viewer' | 'operator' | 'owner';
export const ROLE_LABEL: Record<AdminRole, '열람자' | '운영자' | '관리자'>;
export function roleRank(role: AdminRole): 1 | 2 | 3;
export function hasRole(actual: AdminRole, min: AdminRole): boolean;

// src/lib/admin/session.ts  (pure)
export const SESSION_MAX_AGE_SECONDS = 43_200;
export function sessionStartedAt(claims: { amr?: { method: string; timestamp: number }[]; iat?: number }): number | null;
export function isSessionExpired(claims: { amr?: { method: string; timestamp: number }[]; iat?: number }, nowSeconds: number): boolean;
export function safeNext(next: string | null | undefined): string; // '/admin…' only, else '/admin'

// src/lib/admin/supabase/server.ts  (import 'server-only')
export const ADMIN_COOKIE_OPTIONS: { path: '/admin'; sameSite: 'lax'; httpOnly: true; secure: boolean };
export async function createAdminServerClient(): Promise<SupabaseClient<Database>>;
// global headers: x-client-info, x-backoffice-client-ip, x-backoffice-user-agent (spec §3)

// src/lib/admin/dal.ts  (import 'server-only')
export type AdminSession = { userId: string; email: string | null; role: AdminRole; displayName: string;
  aal: 'aal1' | 'aal2'; mfaRequired: boolean; target: BackofficeTarget };
export type AdminGate =
  | { state: 'ok'; session: AdminSession }
  | { state: 'signed_out' } | { state: 'expired' }
  | { state: 'no_access'; email: string | null; hasAppAccount: boolean }
  | { state: 'mfa_required'; enrolled: boolean }
  | { state: 'unavailable'; reason: 'disabled' | 'not_installed' | 'misconfigured' };
export const getAdminGate: () => Promise<AdminGate>;         // React cache(), one whoami per request
export async function verifyAdmin(): Promise<AdminSession>;   // redirect() for every non-ok state
export async function requireRole(min: AdminRole): Promise<AdminSession | null>; // null → caller renders ForbiddenState

// src/lib/admin/auth/actions.ts  ('use server')
export async function signInWithGoogleAction(formData: FormData): Promise<void>;
export async function signInWithPasswordAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>; // local only
export async function verifyTotpAction(prev: AuthFormState, formData: FormData): Promise<AuthFormState>;
export async function enrollTotpAction(): Promise<{ ok: true; factorId: string; qrSvg: string; secret: string } | { ok: false; message: string }>;
export async function signOutAction(formData: FormData): Promise<void>; // scope from formData 'local' | 'global'
export type AuthFormState = { status: 'idle' | 'error'; message?: string };
```

- [ ] **Step 1: Failing unit tests.**
  - `env.test.ts`:
    - target unset → disabled
    - `local` + `https://x.supabase.co` → misconfigured
    - `live` + `http://127.0.0.1:55321` → misconfigured
    - `local` + `http://127.0.0.1:55321` + key → enabled
    - missing key → misconfigured
  - `session.test.ts`:
    - `safeNext('//evil.com')`, `safeNext('https://x')`, `safeNext('/admin/../x')` → `/admin`
    - `safeNext('/admin/requests?view=attention')` passes
    - `isSessionExpired` with `amr` 12 h + 1 s ago → true; with `amr` missing → falls back to `iat`
  - `roles.test.ts`: the rank order.
  - `whoami.test.ts`: zod parses the fixture `{"userId":"…","email":null,"admin":false,"role":null,"displayName":null,"mfaRequired":false,"aal":"aal1","mfaEnrolled":false,"ready":false,"hasAppAccount":true}`.

  Run `npx vitest run src/lib/admin`. Expected: FAIL.
- [ ] **Step 2: Implement** env, roles, session and whoami. Run the unit tests. Expected: PASS.
- [ ] **Step 3: Supabase clients.**
  - `createServerClient(url, key, { cookies: { getAll, setAll }, cookieOptions: ADMIN_COOKIE_OPTIONS, global: { headers } })`.
  - In Server Components, `setAll` swallows errors, because the proxy refreshes.
  - `updateAdminSession(request)` follows `.context/scratch-backoffice/src/lib/admin/supabase/proxy.ts`, without the scratch bypass, plus:
    - when env is disabled, rewrite to `/admin/unavailable?reason=disabled`
    - public paths: `/admin/login`, `/admin/auth/callback`, `/admin/unavailable`
    - when `isSessionExpired`, call `signOut({ scope: 'local' })` and redirect to `/admin/login?reason=expired`
    - always set `Cache-Control private, no-store` and `X-Robots-Tag noindex, nofollow`
    - forward the request header `x-admin-path` (pathname + search) through `NextResponse.next({ request: { headers } })`, and keep it when `setAll` rebuilds the response, so the DAL can build `next=`
  - `src/proxy.ts` exports `proxy` and `config.matcher = ['/admin', '/admin/:path*']`.
- [ ] **Step 4: DAL.** `getAdminGate` handles each case:
  - env disabled → unavailable
  - `getClaims()` has no sub → signed_out
  - expired → expired
  - `rpc('backoffice_whoami')` error code `PGRST202` → unavailable/not_installed
  - `!admin` → no_access
  - `!ready && mfaRequired` → mfa_required

  `verifyAdmin` maps the states to `redirect()`:
  - `signed_out` → `/admin/login?next=` the current path (read the `x-admin-path` header set by the proxy)
  - `expired` → `/admin/login?reason=expired`
  - `mfa_required` → `/admin/mfa?next=…`
  - `no_access` → `/admin/no-access`
  - `unavailable` → `/admin/unavailable?reason=…`
- [ ] **Step 5: Pages and actions** per spec §10.1 to §10.4, copy verbatim.
  - Google: `signInWithOAuth` with `redirectTo = new URL('/admin/auth/callback', getSiteUrl()).href + '?next=' + encodeURIComponent(safeNext(next))` and `queryParams: { prompt: 'select_account' }`, then `redirect(data.url)`.
  - The callback route runs `exchangeCodeForSession(code)` and redirects to `safeNext`. On error it goes to `/admin/login?error=oauth`.
  - The password form renders only for `target === 'local'`, and the action refuses otherwise.
  - The MFA page lists factors with `supabase.auth.mfa.listFactors()`. A verified TOTP factor gets the challenge form, which uses `challengeAndVerify`. Otherwise the page shows enrolment: QR as `<img src={qrSvg}>` data URI, the secret in a copyable code block, then verify.
  - `no-access` shows the email from the gate.
  - `unavailable` reads `searchParams.reason`.
- [ ] **Step 6: E2E harness and auth spec.**
  - `playwright.admin.config.ts`: `testDir 'tests/e2e-admin'`, one `desktop` project (Chromium 1440x900), `locale 'ko-KR'`, `timezoneId 'Asia/Seoul'`, `globalSetup`, `workers: 1`. Its `webServer` is identical to `playwright.config.ts` (`LEAD_DRY_RUN=1 npx next dev -p 3100`, `reuseExistingServer: !CI`), so only one `next dev` runs.
  - `global-setup.ts`: fails fast with "로컬 Supabase가 꺼져 있어요: supabase-local/scripts/start.sh 후 reset.sh를 실행해 주세요" unless `http://127.0.0.1:55321/rest/v1/rpc/app_bootstrap_config` responds and the owner's whoami is ready.
  - `fixtures.ts`: a `test` with `asRole(role: 'owner'|'operator'|'viewer'|'spare')` that logs in through the UI password form and caches `storageState` under `.context/playwright/admin-state/<role>.json`.
  - `helpers/rest.ts`:
    - `demoUserRpc(email, fn, args)`: password sign-in of a demo app user with the publishable key, then `rpc`
    - `staffRpc(role, fn, args)`
    - `psql(sql)` through `supabase-local/scripts/psql.sh` (local only)

  Then write `tests/e2e-admin/auth.spec.ts`:
  - `/admin` while signed out → 307 to `/admin/login?next=%2Fadmin`
  - wrong password → "이메일 또는 비밀번호를 확인해 주세요."
  - viewer login → lands on `/admin`, which is a 404 until WP-04: assert only that the redirect chain ends under `/admin`
  - `spare@` login → no-access with the email shown
  - `?next=//evil.com` → after login stays on `/admin`
  - the session cookie is httpOnly with path `/admin` (`context.cookies()`)
  - `GET /` sets no `sb-` cookie and has no `X-Robots-Tag`
- [ ] **Step 7: Verify and commit.** Run `npm run lint && npm run typecheck && npm test`. Commit `feat(admin): add staff auth, MFA, session gate and proxy`.

**Acceptance:**
- All unit tests pass and the e2e assertions above pass against the local stack.
- No browser Supabase client exists: `grep -r "createBrowserClient" src` is empty.
- No `NEXT_PUBLIC_BACKOFFICE_*` reads in `src`.

### Task WP-03: RPC contract layer and shared UI kit

**Files:**
- Create:
  - `src/lib/admin/rpc/{core,schemas,index}.ts`, `src/lib/admin/rpc/__fixtures__/*.json`
  - `src/lib/admin/{actions,shared-actions,format,labels,csv,search-params,operation-id}.ts`
  - `src/components/admin/data-table/{DataTable,DataTableToolbar,FacetFilter,ViewTabs,FilterChips,Pagination,SelectionBar,SearchInput,SortSelect,DateRangeFilter}.tsx`
  - `src/components/admin/states/{EmptyState,ErrorState,ForbiddenState,TableSkeleton}.tsx`
  - `src/components/admin/common/{StatusChip,DdayChip,KstTime,Qty,AccountLink,RequestLink,CopyButton,AutoRefresh,PageHeader,DefinitionList}.tsx`
  - `src/components/admin/forms/{ActionForm,SubmitButton,ReasonDialog,ConfirmDialog,FormMessage}.tsx`
  - `src/components/admin/panels/{NotesPanel,CasePanel,AttachmentViewer,MiniAuditList}.tsx`
  - `src/components/admin/export/ExportDialog.tsx`, `src/app/(admin)/admin/export/[kind]/route.ts`
  - `scripts/admin/capture-rpc-fixtures.mjs`
- Test: `src/lib/admin/rpc/{core,schemas}.test.ts`, `src/lib/admin/{format,labels,csv,search-params,operation-id,actions}.test.ts`

**Interfaces:**
- Consumes: `createAdminServerClient`, `verifyAdmin`, `requireRole`, `AdminRole`, `hasRole` (WP-02); `Database` (WP-01); shadcn ui (WP-00).
- Produces:

```ts
// rpc/core.ts (server-only)
export type RpcErrorKind = 'forbidden' | 'invalid' | 'conflict' | 'not_installed' | 'unauthenticated' | 'network' | 'unknown';
export type RpcError = { kind: RpcErrorKind; message: string; code?: string };
export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: RpcError };
export function mapRpcError(err: { code?: string; message?: string } | null | undefined, status?: number): RpcError;
//  42501 → forbidden (DB message) | P0001 → invalid (DB message; 'conflict' when message contains '다른 운영자가'
//  or '같은 작업 번호로' → message '이미 처리된 작업이에요. 화면을 새로고침한 뒤 다시 시도해 주세요.')
//  PGRST202 → not_installed | PGRST301/PGRST302 or status 401 → unauthenticated '로그인이 만료됐어요. 다시 로그인해 주세요.'
//  fetch TypeError → network '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' | else unknown '잠시 후 다시 시도해 주세요.'
export async function callRpc<T>(fn: keyof Database['public']['Functions'], args: Record<string, unknown>,
  schema: import('zod').ZodType<T>): Promise<RpcResult<T>>; // schema failure → unknown + console.error(fn)

// rpc/index.ts: camelCase args → p_snake args; one function per RPC in spec §8:
export const rpc: {
  overview(a: { includeDemo: boolean; days: 1 | 7 | 30 }): Promise<RpcResult<Overview>>;
  anomalies(a: { includeDemo: boolean }): Promise<RpcResult<Anomalies>>;
  listAccounts(a: { search?: string; role?: 'retailer' | 'uncle' | 'none'; state?: AccountState; includeDemo: boolean;
    sort?: AccountSort; limit: number; offset: number }): Promise<RpcResult<AccountList>>;
  getAccount(id: string): Promise<RpcResult<AccountDossier>>;
  listRequests(a: { labels?: RequestLabel[]; attention?: RequestAttention; accountId?: string; search?: string;
    from?: string; to?: string; includeDemo: boolean; sort?: RequestSort; limit: number; offset: number }): Promise<RpcResult<RequestList>>;
  getRequest(id: string): Promise<RpcResult<RequestDossier>>;
  listRecords<C extends RecordCollection>(a: { collection: C; filter?: RecordFilter; status?: string; requestId?: string;
    accountId?: string; includeDemo: boolean; limit: number; offset: number }): Promise<RpcResult<RecordList<C>>>;
  listConversations(a: { accountId?: string; includeDemo: boolean; limit: number; offset: number }): Promise<RpcResult<ConversationList>>;
  getConversation(a: { a: string; b: string; reason: string; before?: string; limit?: number }): Promise<RpcResult<Conversation>>;
  attachmentAccess(id: string, reason: string): Promise<RpcResult<AttachmentAccess>>;
  search(q: string, limit?: number): Promise<RpcResult<SearchResult>>;
  listLeads(a: { status?: LeadStatus; search?: string; includeSuspect: boolean; limit: number; offset: number }): Promise<RpcResult<LeadList>>;
  listConfig(): Promise<RpcResult<ConfigRow[]>>;
  listNotices(includeInactive?: boolean): Promise<RpcResult<NoticeRow[]>>;
  listAudit(a: { action?: string; actorId?: string; targetType?: string; targetId?: string; from?: string; to?: string;
    limit: number; offset: number }): Promise<RpcResult<AuditList>>;
  listOperations(a: { accountId?: string; command?: string; limit: number; offset: number }): Promise<RpcResult<OperationList>>;
  listAdmins(): Promise<RpcResult<AdminRow[]>>;
  lookupUser(email: string): Promise<RpcResult<LookupUser>>;
  exportRows(a: { kind: ExportKind; reason: string; from?: string; to?: string; includeDemo: boolean }): Promise<RpcResult<ExportResult>>;
  verifyAuditChain(): Promise<RpcResult<ChainResult>>;
  reviewDocument(a: { accountId: string; documentId: string; decision: 'verified' | 'rejected' | 'reset'; userMessage: string;
    internalNote: string; checks: Record<string, boolean>; operationId: string }): Promise<RpcResult<{ accountId: string; verificationStatus: string; reviewId: number }>>;
  setAccountStatus(a: { accountId: string; status: 'active' | 'suspended'; reason: string; userMessage: string; banLogin: boolean;
    operationId: string }): Promise<RpcResult<{ accountId: string; status: string; loginBanned: boolean }>>;
  addNote(a: { targetType: NoteTarget; targetId: string; body: string; operationId: string }): Promise<RpcResult<{ noteId: number }>>;
  openCase(a: { targetType: CaseTarget; targetId: string; title: string; severity: CaseSeverity; assigneeId?: string; note?: string; operationId: string }): Promise<RpcResult<{ caseId: string }>>;
  updateCase(a: { caseId: string; version: number; status?: CaseStatus; severity?: CaseSeverity; assigneeId?: string; clearAssignee?: boolean; note?: string; operationId: string }): Promise<RpcResult<{ caseId: string; version: number; status: CaseStatus }>>;
  saveNotice(a: NoticeInput & { operationId: string }): Promise<RpcResult<{ noticeId: string; version: number; active: boolean }>>;
  setConfig(a: { key: string; value: unknown; reason: string; version?: number; isPublic?: boolean; description?: string; operationId: string }): Promise<RpcResult<{ key: string; version: number }>>;
  grantAdmin(a: { userId: string; role: AdminRole; displayName: string; requireMfa: boolean; operationId: string }): Promise<RpcResult<{ userId: string; role: AdminRole }>>;
  revokeAdmin(a: { userId: string; reason: string; operationId: string }): Promise<RpcResult<{ userId: string; revoked: true }>>;
  setLeadStatus(a: { leadId: string; status: LeadStatus; assigneeId?: string; note?: string; operationId: string }): Promise<RpcResult<{ leadId: string; status: LeadStatus }>>;
};
// All result types are z.infer of schemas.ts and are exported from rpc/index.ts.

// actions.ts
export type ActionState = { status: 'idle' } | { status: 'success'; message: string; data?: unknown }
  | { status: 'error'; message: string; kind: RpcErrorKind | 'validation'; fieldErrors?: Record<string, string> };
export async function runAdminAction<I, O>(o: { minRole: AdminRole; formData: FormData; schema: import('zod').ZodType<I>;
  call: (input: I, operationId: string) => Promise<RpcResult<O>>; success: string | ((o: O) => string);
  revalidate?: string[] }): Promise<ActionState>; // verifies the role, parses, requires a uuid 'operationId' field, maps errors

// shared-actions.ts ('use server')
export async function addNoteAction(prev: ActionState, fd: FormData): Promise<ActionState>;   // fields targetType,targetId,body,operationId,path
export async function openCaseAction(prev: ActionState, fd: FormData): Promise<ActionState>;
export async function updateCaseAction(prev: ActionState, fd: FormData): Promise<ActionState>;
export async function openAttachmentAction(attachmentId: string, reason: string): Promise<
  { ok: true; url: string; mime: string; name: string | null; expiresAt: string } | { ok: false; message: string }>; // createSignedUrl(path, 60)
export async function searchAction(q: string): Promise<SearchResult | null>;
export async function searchAccountsAction(q: string): Promise<{ id: string; name: string; role: string | null }[]>; // combobox

// format.ts
export function formatKst(iso: string | null | undefined, opts?: { withYear?: 'auto' | 'always'; time?: boolean }): string; // '10월 13일 02:05', '-' for null
export function formatRelative(iso: string | null | undefined, now?: Date): string; // '12시간 전', '방금'
export function formatSince(iso: string | null | undefined, now?: Date): string;   // '3일째', '5시간째'
export function kstDayRange(day: string): { from: string; to: string };            // ISO UTC bounds of a KST day
export function kstToday(now?: Date): string;                                       // 'YYYY-MM-DD'
export function qty(n: number, unit: '장' | '건' | '회차' | '곳' | '명' | '개'): string;   // '2장'
export function bytes(n: number): string;                                          // '12.3MB'
export function dday(days: number | null): { label: string; tone: 'attention' | 'normal' | 'neutral' } | null; // '오늘' | 'n일 지남' | 'n일 남음'

// labels.ts (client-safe): every map from spec §9 and §10
export type Tone = 'attention' | 'normal' | 'done' | 'ended';
export const REQUEST_LABELS: readonly ['거절','취소 종료','완료','문제 확인 중','변경·취소 협의 중','확인 대기','답변 필요','수령 대기','미송 재확인','미송 대기','픽업 완료','진행 중'];
export type RequestLabel = typeof REQUEST_LABELS[number];
export function statusTone(label: string): { tone: Tone; icon: 'WarningCircle' | 'Clock' | 'CheckCircle' | 'XCircle' };
export const REQUEST_TABS: { key: string; label: string; labels: RequestLabel[] | null }[];
export const VIOLATION_LABEL: Record<string, string>; export function violationLabel(code: string): string;
export const ANOMALY_LABEL: Record<string, string>; export const MISSING_FIELD_LABEL: Record<string, string>;
export const AUDIT_ACTION_LABEL: Record<string, string>; export function auditActionLabel(action: string): string;
export const VERIFICATION_LABEL: Record<'missing'|'not_required'|'unverified'|'verified'|'stale'|'rejected'|'none', string>;
export const LEAD_STATUS_LABEL, CASE_STATUS_LABEL, NOTICE_STATE_LABEL, CONNECTION_STATUS_LABEL, PROPOSAL_STATUS_LABEL,
  ISSUE_STATUS_LABEL, DELIVERY_STATE_LABEL, SIGNUP_STAGE_LABEL, ROLE_KIND_LABEL /* retailer 소매업자, uncle 사입삼촌 */;
export const REQUIRED_FIELD_TOTAL = { retailer: 11, uncle: 7 } as const;

// csv.ts
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string;
// '﻿' + CRLF + RFC 4180 quoting; cells starting with = + - @ \t \r get a leading "'"

// search-params.ts (nuqs; shared by server createSearchParamsCache and client useQueryStates)
export const pageParsers: { page: ParserBuilder<number>; size: ParserBuilder<50 | 100 | 200>; q: ParserBuilder<string>;
  sort: ParserBuilder<string>; demo: ParserBuilder<boolean>; view: ParserBuilder<string> };
export const dateRangeParsers: { from: ParserBuilder<string>; to: ParserBuilder<string> }; // 'YYYY-MM-DD' (KST days)
export function toOffset(page: number, size: number): number;

// operation-id.ts
export function newOperationId(): string; export function isOperationId(v: unknown): v is string;
```

Component contracts:
- `DataTable<T>({ columns, rows, total, page, size, getRowId, rowHref?, selectable?, footer?, empty, caption })`
  - Client component. Rows render as `<a>`; Enter opens. The sticky header has `aria-sort`. Virtualized when there are more than 100 rows.
  - Page and size live in the URL (`shallow: false`, so the server re-renders).
- `ViewTabs({ tabs: { key; label; count? }[], param = 'view' })`
- `FacetFilter({ param, title, options: { value; label; count }[], multiple? })`
- `SearchInput({ param = 'q', placeholder })`: debounces 250 ms and skips while `isComposing`.
- `ActionForm({ action, operationId, children, successMessage?, onSuccess? })`: wraps `useActionState`, renders `<input type="hidden" name="operationId">`, an aria-live region and a sonner toast.
- `ReasonDialog({ title, description, defaultReason?, confirmLabel, onConfirm(reason) })`: needs at least 5 characters.
- `ConfirmDialog({ title, description, confirmLabel, typedConfirmation?, destructive? })`
- `NotesPanel({ targetType, targetId, notes, canWrite, operationId })`
- `CasePanel({ targetType, targetId, cases, assignees, canWrite, operationId })`
- `AttachmentViewer({ attachment: { id, mime, name? }, canOpen, defaultReason })`: on open, calls `openAttachmentAction` and shows an `<img referrerPolicy="no-referrer">` or `<iframe>`, with "링크는 60초 동안만 열려요" and "다시 열기".
- `ExportDialog({ kind, minRole })`: posts a form to `/admin/export/[kind]`.
- `StatusChip({ label })`, `DdayChip({ days })`, `KstTime({ iso })` (absolute text, relative tooltip), `AutoRefresh({ intervalMs = 30000 })`, `ForbiddenState({ min })`, `EmptyState({ title, description, resetHref? })`, `ErrorState({ message, retryHref })`.

- [ ] **Step 1: Capture fixtures.** `scripts/admin/capture-rpc-fixtures.mjs` signs in as viewer, operator and owner (local URL, publishable key only), calls every read RPC with representative args, and writes `src/lib/admin/rpc/__fixtures__/<rpc>.<role>.json`. Run it after `supabase-local/scripts/reset.sh`.
- [ ] **Step 2: Failing tests.**
  - `schemas.test.ts`: every fixture parses with its schema; viewer fixtures have `masked: true` in dossiers.
  - `core.test.ts`: mapRpcError for 42501, P0001, P0001 with '다른 운영자가' → conflict, P0001 with '같은 작업 번호로' → conflict with the rotation message, PGRST202, PGRST301, status 401, a TypeError, and an unknown code that does not echo the raw text.
  - `format.test.ts`:
    - `formatKst('2026-10-12T17:05:00Z')` → '10월 13일 02:05'
    - `kstDayRange('2026-10-13')` → `{ from: '2026-10-12T15:00:00.000Z', to: '2026-10-13T15:00:00.000Z' }`
    - `formatKst(null)` → '-'
    - `qty(2,'장')` → '2장'
    - `dday(-3)` → '3일 지남' attention
  - `labels.test.ts`: every `REQUEST_LABELS` member has a tone; `REQUEST_TABS` labels cover all 12 exactly once except 전체; an unknown violation code → '수량 규칙을 벗어났어요'.
  - `csv.test.ts`: BOM, a quote inside a cell, a newline inside a cell, `=SUM(1)` → `'=SUM(1)`.
  - `actions.test.ts`: `runAdminAction` with a missing or invalid operationId → validation error; with a mocked call returning forbidden → error state.

  Run `npx vitest run src/lib/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** core, schemas (zod 4, `.passthrough()` off; the shapes come from the fixtures), index, format, labels, csv, search-params, operation-id and actions. Run vitest. Expected: PASS.
- [ ] **Step 4: Components** per the contracts.
  - Tables use 48px rows, a bold first line over a muted second line, and right-aligned numeric columns.
  - Empty, error and loading states use the exact copy in spec §9.
  - The Pagination label reads "{from}-{to} / {total}건", with buttons "이전" and "다음".
- [ ] **Step 5: Export route.** `POST /admin/export/[kind]`:
  1. `verifyAdmin()`; reject when the `Origin` header differs from the request host (403).
  2. Read the form fields `reason`, `from`, `to` (KST days → `kstDayRange`) and `demo`.
  3. Call `rpc.exportRows`. On error, redirect back with `?exportError=` and the message.
  4. Build the CSV with `toCsv` and a column map per kind (Korean headers, for example 요청 ID, 요청 시각, 상태, 소매업자, 사입삼촌, 도매처, 위치, 상품, 옵션, 요청, 확보, 전달, 수령, 취소, 남은 미송, 재확인일).
  5. Respond with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="saip-{kind}-{YYYYMMDD}.csv"` and `Cache-Control: no-store`.
  6. When the result is truncated, add the header `X-Export-Truncated: 1`.
- [ ] **Step 6: Verify and commit.** Run `npm run lint && npm run typecheck && npm test`. Commit `feat(admin): add typed RPC layer, formatting, labels and shared table and form kit`.

**Acceptance:**
- Every RPC in spec §8 has a wrapper and a zod schema that parses its captured fixture.
- The unit tests above pass.
- No component imports `server-only` modules into client code: the build passes.
- `grep -rn "sb_secret\|service_role" src` is empty.

### Task WP-04: Console shell, navigation, ⌘K, search, 내 계정

**Files:**
- Create:
  - `src/app/(admin)/admin/(console)/{layout,error,not-found,loading}.tsx`
  - `(console)/default.tsx` (children default, `notFound()`), `(console)/@sheet/default.tsx`, `(console)/@sheet/[...missing]/page.tsx` (same slug as `(console)/[...missing]`: Next 16.4 rejects different slug names for one dynamic path)
  - `(console)/[...missing]/page.tsx`
  - `(console)/search/page.tsx`, `(console)/account/page.tsx`
  - `src/lib/admin/nav.ts`
  - `src/components/admin/shell/{AppSidebar,TopBar,EnvPill,DemoToggle,UserMenu,CommandPalette,Breadcrumbs,LiveRule}.tsx`
- Test: `src/lib/admin/nav.test.ts`, `tests/e2e-admin/shell.spec.ts`

**Interfaces:**
- Consumes: `verifyAdmin`, `AdminSession` (WP-02); `rpc.overview`, `searchAction`, kit (WP-03).
- Produces:

```ts
// nav.ts
export type NavItem = { key: string; label: string; href: Route; icon: PhosphorIconName; minRole: AdminRole;
  badge?: (o: Overview) => number | null };
export const NAV_GROUPS: { label: string; items: NavItem[] }[]; // exactly spec §9 sidebar
export function visibleNav(role: AdminRole): { label: string; items: NavItem[] }[];
export function navTitle(pathname: string): string | null;     // for breadcrumbs and document titles
```

`(console)/layout.tsx` signature: `export default async function ConsoleLayout({ children, sheet }: LayoutProps<'/admin'> & { sheet: React.ReactNode })`.

- [ ] **Step 1: Failing tests.** `nav.test.ts`:
  - `visibleNav('viewer')` excludes 감사 로그 and 운영 계정
  - `visibleNav('operator')` includes 감사 로그 and not 운영 계정
  - `visibleNav('owner')` includes all
  - every href starts with `/admin`
  - the labels equal spec §9 in order

  `shell.spec.ts` (viewer and owner):
  - the sidebar groups and items per role
  - the env pill shows "로컬 데이터 · 테스트"
  - ⌘K opens the palette; typing "셀렉트" shows 계정 results; Enter navigates
  - Hangul composition: `page.keyboard.insertText` per syllable sends no request until composition ends (watch network)
  - `/admin/nope` renders the admin not-found ("찾는 화면이 없어요")

  Expected: FAIL.
- [ ] **Step 2: Implement the layout.** Call `verifyAdmin()`, then `rpc.overview({ includeDemo, days: 1 })` (error tolerant: badges hidden). Render `SidebarProvider` + `AppSidebar` + `TopBar` + `<main id="main">{children}</main>{sheet}` + `LiveRule` (the 4px deep-green top rule). Add a skip link "본문으로 건너뛰기".
  - `error.tsx`: "화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." + "다시 시도" (`reset()`).
  - `not-found.tsx`: "찾는 화면이 없어요" / "주소를 다시 확인해 주세요." + "대시보드로 가기".
  - `loading.tsx`: a skeleton header and a table.
- [ ] **Step 3: Palette and search** per spec §9.
  - `CommandPalette` is cmdk inside the shadcn `CommandDialog` (with the `<Command>` wrapper). It opens on ⌘K or Ctrl+K and from the top-bar button "계정·요청·화면 찾기" with a `Kbd` "⌘K".
  - It calls `searchAction` with a 200 ms debounce, skipping while composing.
  - Groups: 계정, 요청, 문의, 화면, 바로가기, 최근 항목 (localStorage key `au-admin-recent`, ids and labels only, at most 5).
  - `/admin/search` is a server page with scope tabs and highlighted matches: split on a case-insensitive match and wrap it in `<mark>`.
- [ ] **Step 4: 내 계정** (spec §10.19). It uses the WP-02 actions (`enrollTotpAction`, `signOutAction` with scope global).
- [ ] **Step 5: Verify and commit.** Run vitest, `npx playwright test -c playwright.admin.config.ts tests/e2e-admin/shell.spec.ts`, lint and typecheck. Commit `feat(admin): add console shell, navigation, command palette and search`.

**Acceptance:**
- Role-aware navigation with badges.
- ⌘K works with Hangul.
- The sheet slot is wired, with a null default.
- Every console route is protected by `verifyAdmin` in the layout, and pages still call `requireRole` themselves where a role above viewer is needed.

### Task WP-05: 대시보드 and 운영 점검

**Files:**
- Create: `(console)/page.tsx`, `(console)/checks/{page,loading,error}.tsx`, `src/components/admin/dashboard/{KpiTiles,AttentionQueue,NewRequestsChart,StageBar,BackorderAgingChart,SideSummary,RangeToggle}.tsx`, `src/components/admin/checks/{AnomalyTable,KindChips}.tsx`, `src/components/admin/dashboard/stages.ts`
- Test: `src/components/admin/dashboard/stages.test.ts`, `tests/e2e-admin/dashboard.spec.ts`

**Interfaces:**
- Consumes: `rpc.overview`, `rpc.anomalies`, `ANOMALY_LABEL`, `VIOLATION_LABEL`, `formatKst`, chart ui (WP-00/03).
- Produces: `toStages(requestLabels: Record<string, number>): { key: '확인 대기' | '진행 중' | '수령 대기' | '완료'; count: number }[] & { ended: number }`.

- [ ] **Step 1: Failing tests.** `stages.test.ts`: `toStages({ '확인 대기': 2, '답변 필요': 1, '미송 재확인': 1, '수령 대기': 3, '완료': 4, '거절': 1, '취소 종료': 2 })` → 확인 대기 2, 진행 중 2, 수령 대기 3, 완료 4, ended 3.

  `dashboard.spec.ts`:
  - 6 tiles with spec copy, each linking to the right filtered URL; clicking "확인이 필요한 요청" lands on `/admin/requests?view=attention` with the matching count
  - the range toggle updates `?range=7`
  - the queue shows items with reason chips
  - `/admin/checks` lists anomalies with kind chips
  - after corrupting a request through `psql.sh` inside the test (restored afterwards), a "수량 기록 불일치" row appears

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.5 and §10.6.
  - Charts follow the dataviz rules: single-series bars in `--chart-5`, the ordinal ramp for stages, no legend for single series, axes at 0, tooltips with "{n}건".
  - Use `AutoRefresh`.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add dashboard and operations checks`.

**Acceptance:** The tiles, queue, charts and checks match the spec copy. Loading, error and empty states exist. axe shows no serious violations.

### Task WP-06: 계정·가입 and 거래처 연결

**Files:**
- Create:
  - `(console)/accounts/{page,loading,error}.tsx`, `(console)/accounts/[id]/{page,loading,error}.tsx`, `(console)/accounts/{actions,search-params}.ts`
  - `(console)/connections/{page,loading,error}.tsx`, `(console)/connections/search-params.ts`
  - `src/components/admin/accounts/{AccountsTable,AccountFacetRail,AccountHeader,ProfileTab,DocumentTab,DocumentReviewForm,SuspendDialog,RestoreDialog,ConnectionsTab,RequestHistoryTab,AttachmentsTab,signup.ts}`
  - `src/components/admin/connections/ConnectionsTable.tsx`
- Test: `src/components/admin/accounts/signup.test.ts`, `tests/e2e-admin/accounts.spec.ts`

**Interfaces:**
- Consumes: `rpc.listAccounts`, `getAccount`, `listRecords('connections')`, `reviewDocument`, `setAccountStatus`; kit (WP-03).
- Produces:
  - `signupProgress(role, missing): { label: string; done: number; total: number }`
  - Actions: `reviewDocumentAction(prev, fd)` and `setAccountStatusAction(prev, fd)`, both `ActionState`, revalidating `/admin/accounts/[id]` and `/admin/accounts`.

- [ ] **Step 1: Failing tests.** `signup.test.ts`: `signupProgress('retailer', ['documentId','terms'])` → '정보 입력 9/11'; `('uncle', [])` with complete → '가입 완료'; `(null, ['role'])` → '역할 선택'.

  `accounts.spec.ts`:
  - viewer: the email column is masked; the phone search yields 0; the facet rail filters update the URL and survive a reload; the dossier shows "열람자 권한에서는 연락처가 가려져요."
  - operator: unmasked; 서류 tab → "사유와 함께 열람" (reason "사업자등록증 검토") → the preview shows → review 확인함 → the chip becomes "확인함"; an audit row is visible in the 처리 이력 tab
  - suspend 망원 셀렉트샵 → the chip shows "이용 제한"; then, as that demo user through the REST RPC with a password login, `saip_command renewCode` is refused with the message; restore → the user writes again
  - connections views render counts
  - Hangul search: typing '망원' with IME composition in the search box updates `?q=` once, after composition ends, and the last syllable is never dropped (Review Focus 5)

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.7 and §10.8.
  - Each form's `operationId` comes from `newOperationId()` in the server page.
  - The "확인함" radio is disabled with the hint "먼저 서류 원본을 열람해 주세요" until the viewer opened the document in this page session. The server enforces this anyway.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add accounts, document review, suspension and connections`.

**Acceptance:** The spec §10.7 and §10.8 copy and behaviours. Masking per role. The review and suspension flows work end-to-end, with audit rows.

### Task WP-07: 사입 요청 (list, sheet, full page)

**Files:**
- Create:
  - `(console)/requests/{page,loading,error}.tsx`, `(console)/requests/search-params.ts`
  - `(console)/requests/[id]/{page,loading,error}.tsx`
  - `(console)/@sheet/(.)requests/[id]/page.tsx`
  - `src/components/admin/requests/{RequestsTable,RequestTabs,RequestFilters,RequestsFooter,RequestDetail,RequestSheet,LedgerTiles,ViolationBanner,EventTimeline,DeliveriesTab,ProposalsTab,IssuesTab,PhotosTab,ChatLinkTab,ledger-diff.ts}`
- Test: `src/components/admin/requests/ledger-diff.test.ts`, `tests/e2e-admin/requests.spec.ts`

**Interfaces:**
- Consumes: `rpc.listRequests`, `getRequest`, `REQUEST_TABS`, `violationLabel`, NotesPanel, CasePanel, AttachmentViewer, ExportDialog (WP-03).
- Produces:
  - `RequestDetail({ data, session, operationIds })`, a server component shared by the sheet and the page.
  - `ledgerDiff(before, after): { key: '요청'|'확보'|'전달'|'수령'|'취소'|'보류'; from: number; to: number }[]` (changed keys only).

- [ ] **Step 1: Failing tests.** `ledger-diff.test.ts`: `before {quantity 3, acquired 1}` → `after {quantity 3, acquired 2}` gives `[{key:'확보',from:1,to:2}]`; null before → `[]`.

  `requests.spec.ts`:
  - each tab count equals its row total
  - the 진행 중 tab includes 픽업 완료 and 미송 대기 rows
  - search for a demo product filters
  - clicking a row opens the Sheet, the list's scroll position stays, Escape closes it and the URL returns
  - a direct `/admin/requests/<id>` renders the full page with the same content
  - the ledger tiles show 장
  - the viewer timeline has no before/after; the operator's does
  - the footer totals match
  - operator adds two different notes in a row from the same open sheet; both appear, because the operation id rotates (Review Focus 1)
  - the operator CSV export downloads a file starting with `﻿요청 ID`

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.9.
  - Intercepted Sheet: the `RequestSheet` client wrapper renders `<Sheet open onOpenChange={() => router.back()}>` around `RequestDetail`.
  - The full page renders `RequestDetail` inside the page shell.
  - Use the event title split: line 1 bold, the rest muted.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add request list, detail sheet and ledger history`.

**Acceptance:** The spec §10.9 copy, tabs, filters, footer and sheet/page parity. Violations render as the Korean banner.

### Task WP-08: 전달·수령, 미송 재확인, 문제·정정

**Files:**
- Create: `(console)/deliveries/{page,loading,error}.tsx`, `(console)/backorders/{page,loading,error}.tsx`, `(console)/issues/{page,loading,error}.tsx`, the search-params for each, `src/components/admin/deliveries/DeliveriesTable.tsx`, `src/components/admin/backorders/{BackordersTable,AgingChart}.tsx`, `src/components/admin/issues/{IssueTriage,ProposalTriage,PropertiesPanel,issue-kind.ts}`
- Test: `src/components/admin/issues/issue-kind.test.ts`, `tests/e2e-admin/trade-flow.spec.ts`

**Interfaces:**
- Consumes: `rpc.listRecords('deliveries'|'issues'|'proposals')`, `rpc.listRequests({ attention, sort: 'recheck_asc' })`, `rpc.getRequest` (properties panel), kit.
- Produces: `issueKind(reason: string, hasActual: boolean): '상품·옵션이 달라요' | '수량이 부족해요' | '오염·파손이 있어요' | '수령 수량 차이' | '기타'`.

- [ ] **Step 1: Failing tests.** `issue-kind.test.ts`: `'수량이 부족해요\n2장 모자람'` → '수량이 부족해요'; a reason with `actual` present → '수령 수량 차이'; anything else → '기타'.

  `trade-flow.spec.ts`:
  - deliveries views (수령 대기, 48시간 넘음, 수량 차이, 정정된 회차) have counts equal to their rows
  - the 회차 column shows "{n}차"
  - a row opens the request sheet
  - backorders: "오늘 재확인" rows have D-day "오늘", "기한 지남" rows show "{n}일 지남" in attention tone, and the 재확인 알림 column reads "보냄 · …" or "아직 없음"
  - issues: the 3-pane layout; selecting an issue fills the 속성 panel; the proposals tab views render

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.10 to §10.12.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add deliveries, back-order rechecks and issue triage`.

**Acceptance:** The spec copy and views. Read-only notes are present. Links open the request sheet.

### Task WP-09: 채팅 열람, 알림·공지, 랜딩 문의

**Files:**
- Create:
  - `(console)/chats/{page,loading,error}.tsx`, `(console)/chats/actions.ts`
  - `(console)/notices/{page,loading,error}.tsx`, `(console)/notices/actions.ts`
  - `(console)/leads/{page,loading,error}.tsx`, `(console)/leads/actions.ts`
  - search-params files for each
  - `src/components/admin/chats/{ConversationList,TranscriptPane,MessageItem,ChatProperties}.tsx`
  - `src/components/admin/notices/{NoticeHistoryTable,NoticesTable,NoticeEditor,NoticePreview,notice-form.ts}`
  - `src/components/admin/leads/{LeadsTable,LeadSheet}.tsx`
- Test: `src/components/admin/notices/notice-form.test.ts`, `tests/e2e-admin/{chats,notices,leads}.spec.ts`

**Interfaces:**
- Consumes: `rpc.listConversations`, `getConversation`, `listRecords('notices')`, `listNotices`, `saveNotice`, `listLeads`, `setLeadStatus`, `attachmentAccess`.
- Produces:
  - `openConversationAction(a, b, reason, before?)` returning `{ ok: true; data: Conversation } | { ok: false; message }`. The transcript is never put in a URL.
  - `saveNoticeAction(prev, fd)`, `setLeadStatusAction(prev, fd)`.
  - `noticeFormSchema` (zod): title 1 to 80, body 1 to 2000, https link, KST datetime-local inputs converted to ISO, end after start.

- [ ] **Step 1: Failing tests.** `notice-form.test.ts`: an empty title → '공지 제목은 1~80자로 입력해 주세요.'; `http://` → '링크는 https 주소만 넣을 수 있어요.'; `'2026-10-13T09:00'` KST → `'2026-10-13T00:00:00.000Z'`.

  `chats.spec.ts`:
  - viewer sees the list and a disabled "사유와 함께 열람" with the tooltip
  - operator with a 4-character reason gets the validation message
  - a valid reason shows the transcript with masked phone numbers (`010-••••-1234` pattern), and no `/admin/chats/...` URL appears
  - the audit tab (operator) shows "대화 열람" with the reason
  - "이전 대화 더 보기" pages

  `notices.spec.ts`:
  - create a draft, then publish with the dialog copy
  - the state chip reads "게시 중"
  - an `app_bootstrap_config` RPC call as the demo retailer (REST) returns the notice; as the demo uncle it does not
  - operator choosing 긴급 → the owner-only message
  - a version conflict (bump through a second context) → the conflict message, input kept

  `leads.spec.ts`:
  - the viewer's contact is masked and the message hidden
  - operator changes the status to 연락함 with a note → the row updates
  - the "의심 제외" view hides the e2e and timing-suspect rows
  - owner CSV export works

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.13, §10.14 and §10.16.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add chat review, notices and landing leads`.

**Acceptance:**
- Transcripts never appear in a URL, the RSC payload or the console.
- Notices honour roles and the window.
- Leads are masked per role.

### Task WP-10: 원격 설정, 감사 로그, 운영 계정

**Files:**
- Create:
  - `(console)/remote-config/{page,loading,error}.tsx`, `(console)/remote-config/actions.ts`
  - `(console)/audit/{page,loading,error}.tsx`, `(console)/audit/actions.ts`
  - `(console)/admins/{page,loading,error}.tsx`, `(console)/admins/actions.ts`
  - search-params files
  - `src/components/admin/remote-config/{ConfigTable,MaintenanceEditor,MinVersionEditor,FeatureFlagsEditor,SupportEditor,ConfigHistory,config-forms.ts}`
  - `src/components/admin/audit/{AuditTable,OperationsTable,ChainVerifyButton}.tsx`
  - `src/components/admin/admins/{AdminsTable,GrantAdminSheet,RevokeDialog}.tsx`
- Test: `src/components/admin/remote-config/config-forms.test.ts`, `tests/e2e-admin/{remote-config,audit,admins}.spec.ts`

**Interfaces:**
- Consumes: `rpc.listConfig`, `setConfig`, `listAudit`, `listOperations`, `verifyAuditChain`, `listAdmins`, `lookupUser`, `grantAdmin`, `revokeAdmin`.
- Produces:
  - `setConfigAction`, `verifyChainAction`, `lookupUserAction`, `grantAdminAction`, `revokeAdminAction`
  - zod schemas mirroring `validate_config`: `maintenanceSchema`, `minVersionSchema` (semver `^\d+\.\d+\.\d+`, minimum ≤ recommended, https store URL), `featureFlagsSchema`, `supportSchema`

- [ ] **Step 1: Failing tests.** `config-forms.test.ts`:
  - blockWrites without enabled → '쓰기 차단은 점검 모드와 함께만 켤 수 있어요.'
  - minimum 0.3.0 > recommended 0.2.0 → '최소 버전이 권장 버전보다 높아요.'
  - store `http://` rejected
  - flag key `new-request` rejected, `newRequest` accepted

  `remote-config.spec.ts`:
  - operator cannot open the 점검 모드 editor (owner-only hint)
  - operator toggles a feature flag with a reason
  - owner enables maintenance with blockWrites after typing "점검 시작"; then a demo user's REST `saip_command('renewCode')` fails with the maintenance message; owner turns it off
  - history shows before → after, and 되돌리기 prefills
  - version conflict → the conflict message, input kept

  `audit.spec.ts`:
  - operator sees rows from earlier specs, filters by 작업 and 운영자, and opens the 앱 작업 기록 tab with command names only
  - owner "무결성 확인" → the success copy with the head hash

  `admins.spec.ts`:
  - owner looks up `spare@agentuncle.local` and grants 열람자
  - spare logs in and sees the console as a viewer
  - owner revokes with a reason, and spare now gets no-access
  - the owner row has no actions
  - operator visiting `/admin/admins` gets ForbiddenState "이 화면은 관리자 이상만 볼 수 있어요."

  Expected: FAIL.
- [ ] **Step 2: Implement** per spec §10.15, §10.17 and §10.18. Typed confirmations go through `ConfirmDialog typedConfirmation`.
- [ ] **Step 3: Verify and commit.** Commit `feat(admin): add remote config, audit log and staff management`.

**Acceptance:**
- Owner-only keys and screens are enforced in the UI and confirmed by the DB.
- The maintenance freeze is proven end-to-end and reverted.
- The staff lifecycle works.

### Task WP-11: Integration, QA and docs

**Files:**
- Create: `tests/e2e-admin/{security,a11y,smoke}.spec.ts`
- Modify: `README.md` (an admin section)

**Interfaces:**
- Consumes: the WP-02 harness (`asRole`, `demoUserRpc`, `staffRpc`, `psql`).

- [ ] **Step 1: `smoke.spec.ts`.** For each role, every console route at or below that role renders an `h1` and logs no console errors, and the nav matches spec §9 exactly.
- [ ] **Step 2: `security.spec.ts`:**
  - `.next/static` has no `sb_secret_`, `service_role` or JWT-shaped strings (this runs after `next build`, in a separate CI step)
  - admin responses carry noindex and no-store
  - the session cookie is httpOnly with path=/admin
  - `/` has no Supabase cookie
  - the export route returns 403 with a foreign `Origin`
  - session expiry mid-action: delete the session cookies, then submit a note. The result is a redirect to `/admin/login?next=…` or the message "로그인이 만료됐어요. 다시 로그인해 주세요.", and the typed text stays in the field until navigation (Review Focus 2)
  - preview mode: after `npm run build`, run `npx next start -p 3102`. Production mode does not load `.env.development.local`, so the BACKOFFICE_* vars are unset. `/admin` must show "이 배포에서는 운영 화면이 꺼져 있어요."
- [ ] **Step 3: `a11y.spec.ts`.** axe (from the existing devDependency) on every console route as operator. No serious or critical violations. Every page has an `h1` and the skip link.
- [ ] **Step 4: Full run.** Run `supabase-local/scripts/reset.sh`, then `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e && npm run test:e2e:admin && npm run qa && supabase/backoffice/run-checks.sh && node supabase-local/scripts/check-api.mjs`. Every step must pass. File failures back to the owning task. Make minimal cross-file fixes only if the owner task is closed, and list each one in the commit body.
- [ ] **Step 5: Docs.** The README admin section covers: local start (`supabase-local/scripts/start.sh`, `reset.sh`, the staff logins), env vars, roles, the scripts, "never service role", and where the migration lives and how it ships. Commit `test(admin): add admin e2e, security and accessibility suites`.

**Acceptance:** Every command in Step 4 is green on a fresh reset. The landing suites are unchanged and green. The security assertions pass.

---

