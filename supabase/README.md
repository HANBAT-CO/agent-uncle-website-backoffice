# Supabase (landing page)

This folder holds **SQL only**.

## Status

| File | Live project `auicerytbhnqeakmkscs` (Agent-Uncle) |
|---|---|
| `migrations/20261011230000_landing_leads.sql` | **Applied 2026-10-12** in one transaction via the Management API SQL endpoint, **not** through `db push`, so `supabase_migrations.schema_migrations` was left untouched. |

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

## How to apply (pick one, do it once)

**A. Preferred: through the app repo**

1. Copy the file into the app repo:
   `cp supabase/migrations/20261011230000_landing_leads.sql <agent-uncle>/supabase/migrations/`
   The app uses 12-digit versions (`202610110005_...`). Renaming the copy to the
   next free one, e.g. `202610110006_landing_leads.sql`, keeps its style; either
   name sorts after the existing migrations.
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
