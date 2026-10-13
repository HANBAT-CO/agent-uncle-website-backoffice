# Supabase (landing page)

This folder holds **SQL only** (plus `backoffice/run-checks.sh`, the local-only runner for the
proposed backoffice layer's checks).

For backoffice development there is a separate, never-linked **local** stack with copies of the
app migrations, this repo's `landing_leads` migration and demo data: see
[`../supabase-local/README.md`](../supabase-local/README.md). When this folder's migration
changes, run `supabase-local/scripts/sync-migrations.sh --copy`.

## Status

| File | Live project `auicerytbhnqeakmkscs` (Agent-Uncle) |
|---|---|
| `migrations/20261011230000_landing_leads.sql` | **Applied 2026-10-12** via the Management API SQL endpoint. Recorded in `supabase_migrations.schema_migrations` on 2026-10-14 (version 20261011230000). |
| `backoffice/20261013090000_backoffice_admin_layer.sql` | **Applied 2026-10-14** (sha256 d26b300e…) in one transaction via the Management API, together with its `schema_migrations` row (version 20261013090000). Verified after apply: live and local fingerprints identical (tables 12/12, functions 72/72, policies 7/7); the publishable key is refused on backoffice tables and RPCs; `app_bootstrap_config` answers for anon. The same file is committed to the app repo on branch `rhtmdgks/backoffice-admin-layer`. No staff row exists yet. |

Verified after applying: RLS on; anon has column-level `INSERT` only and no table grants; one
`INSERT` policy for anon/authenticated; with the publishable key an insert returns 201, while
`SELECT`, `DELETE` and forging `created_at` return 42501 and `consent=false` fails its CHECK
(23514). The single verification row was deleted afterwards (table count 0).

**Follow-up for the app repo (agent-uncle):** add this file to its `supabase/migrations/` so the
schema stays reproducible. The SQL is idempotent, so a normal `supabase db push` from the app repo
can safely re-run it and record the version; alternatively record it without re-running via
`supabase migration repair --status applied <version>`.

## Who owns the schema

The Supabase project is shared with the mobile app. The app repository
(**agent-uncle**, `supabase/migrations/202610110001_workspace.sql` onwards) owns
the migration history (`supabase_migrations.schema_migrations`). This repo is
not linked to the project and must never run `supabase db push`, `db reset` or
`migration up` against it. Doing so would record versions the app repo does not
know about and the two histories would drift.

## Files

| File | What it does |
|---|---|
| `migrations/20261011230000_landing_leads.sql` | Creates `public.landing_leads`: RLS on, anon/authenticated may INSERT a fixed set of columns, no SELECT/UPDATE/DELETE for them. Idempotent (`if not exists`, `drop policy if exists`). |
| `backoffice/20261013090000_backoffice_admin_layer.sql` | **Proposed, canonical.** The `/admin` data layer: staff table and roles, hash-chained audit log, `SECURITY DEFINER` `backoffice_*` RPCs, remote config and notices, the suspension / write-freeze guard and `app_bootstrap_config()`. If any other copy differs, this file wins. |
| `backoffice/backoffice_checks.sql`, `backoffice/run-checks.sh` | Behaviour checks for the layer, run on the **local** stack only inside `BEGIN … ROLLBACK`. Change the SQL here only together with a re-run of `run-checks.sh`. |

## Backoffice layer (proposed)

`backoffice/20261013090000_backoffice_admin_layer.sql` is not on live. Like every schema change it
ships only through the app repo, which owns the migration history; this repo never applies it to
the live project. Until then it exists only on the local stack, as a byte-for-byte migration copy
(`../supabase-local/supabase/migrations/`), where `verify-schema.mjs` lists its objects as
"pending, not on live".

Evidence to hand over with it:

- `backoffice/run-checks.sh --app <dir>`: 153 behaviour checks plus the app's own pgTAP files with
  the layer applied. On the live schema (9 app migrations, 2026-10-14): `chat_message_actions_test`
  44, `phone_availability_test` 13, `workspace_test` 65 and `signup_validation_test` 32 ok (the last
  two from app commit `e9b2e77`; their develop versions need `202610130001`). With the develop-only
  `202610130001`..`202610130003` applied after the layer, all six develop test files pass (363 ok).
- `../supabase-local/supabase/tests/backoffice_test.sql`: a self-contained pgTAP port (185 tests)
  that the app team can copy into its `supabase/tests/` next to its own tests.

Rollout:

1. Build and verify everything locally (`supabase-local/scripts/reset.sh`, then the checks in
   [`../supabase-local/README.md`](../supabase-local/README.md#backoffice-layer-proposed-local-only)).
2. The app team adds `20261011230000_landing_leads.sql` and then this migration to the app repo's
   migration history. They run `supabase test db`, `supabase db lint` (`SECURITY DEFINER`
   warnings are expected, as for `saip_*`), `smoke.py` and `supabase db push --dry-run`.
   Live (2026-10-14) records `202610110001`..`202610110006`, `202610120001`, `202610130000` and
   `202610130004`, but not the develop-only `202610130001`..`202610130003`, so those are already
   "older than the last remote migration": plain `db push` refuses, and `db push --include-all`
   would ship them too. To ship only this layer: record `landing_leads` (already live) with
   `supabase migration repair --status applied 20261011230000`, then push from a checkout whose
   `supabase/migrations/` holds only the live files plus this one (or apply this file in one
   transaction and `supabase migration repair --status applied 20261013090000`). The app team can
   ship `202610130001`..`202610130003` later with `--include-all`; they apply cleanly after the layer.
3. Seed the first owner once in the SQL editor (the owner has signed in once with a separate
   Google account, so the `auth.users` row exists and the email is confirmed; the account has no
   app account):
   ```sql
   insert into public.backoffice_admins (user_id, role, display_name, require_mfa)
   values ('<auth.users.id>', 'owner', '대표', false);
   ```
   Then set the Vercel **Production** env only (Preview stays unset, so preview URLs keep the
   console off) and deploy: `BACKOFFICE_SUPABASE_TARGET=live`,
   `BACKOFFICE_SUPABASE_URL=https://auicerytbhnqeakmkscs.supabase.co` and
   `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY` (the publishable key the app and landing already ship).
   No service-role or secret key goes into Vercel.
4. The owner enrols TOTP, then sets their own `require_mfa = true` in the SQL editor.
5. The app follow-up ships separately (spec §11 "App follow-up": the app reads
   `app_bootstrap_config()` for the update gate, maintenance, suspension and notices, and shows the
   verification label).

## How to apply (pick one, do it once)

**A. Preferred: through the app repo**

1. Copy the file into the app repo:
   `cp supabase/migrations/20261011230000_landing_leads.sql <agent-uncle>/supabase/migrations/`
   Keep the name `20261011230000_landing_leads.sql`: it is already live (outside the history), so
   record it with `supabase migration repair --status applied 20261011230000` instead of running
   it again (re-running is harmless: the SQL is idempotent). It sorts before the backoffice layer
   (`20261013090000`) both as text and as a number.
2. Review it with the app team, test locally (`supabase db reset` in the app
   repo), then ship it with the app's normal `supabase db push` / CI flow.

**B. Dashboard SQL editor (only if A is not possible)**

1. Paste the file into the SQL editor of the project and run it.
2. Immediately add the same file to the app repo's `supabase/migrations/` and
   mark it as applied there so the CLI does not try to run it again:
   `supabase migration repair --status applied <version>`.

## After applying

- The site works without the table: the server action
  (`src/app/actions/lead.ts`) maps "table not found" (`42P01`, `PGRST205`) to
  "잠시 후 다시 시도해 주세요." and logs the cause on the server.
- Read leads in the dashboard (Table editor or SQL as `postgres` /
  `service_role`). The public key cannot read them.
- Never add a service-role key to this repo or to Vercel env for this site.

## Environment

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key, already public in the mobile app. Used server-side only by this site. |

Copy `.env.example` to `.env.local` for local work.
