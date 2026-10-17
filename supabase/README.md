# Supabase: landing and backoffice SQL

This directory contains the canonical landing/backoffice SQL and a local check runner. The
separate, never-linked development stack is documented in
[`../supabase-local/README.md`](../supabase-local/README.md).

## Migration status

| Migration | Status |
|---|---|
| `migrations/20261011230000_landing_leads.sql` | Historical deployment record: applied 2026-10-12 and recorded in migration history on 2026-10-14. |
| `backoffice/20261013090000_backoffice_admin_layer.sql` | Historical deployment record: applied 2026-10-14 with its migration-history row; original staff, audit, RLS/RPC, notices and remote-config layer. |
| `backoffice/20261017090000_app_compatibility.sql` | Applied to `Agent-Uncle` (`auicerytbhnqeakmkscs`) on 2026-10-17, with prerequisite app migrations `202610160005` and `202610160006` and their source SQL recorded in migration history. Adds current request/payment projections and new operational workflows. |

The first two statuses preserve the original deployment dates; their migration-history rows were
also verified during the 2026-10-17 rollout. That explicitly authorized rollout checked the hosted
prerequisites, applied the three reviewed SQL sources in one guarded transaction and verified their
recorded source hashes. All 282 app/backoffice function definitions, execution permissions and
security-definer flags matched the isolated local reference afterward. The source snapshot still
records working-tree provenance, including uncommitted app migrations; see
[`../supabase-local/app-snapshot.json`](../supabase-local/app-snapshot.json). This comparison is not
an assertion that every historical migration source or all production data was exhaustively checked.

## Schema ownership

The shared Supabase project belongs to the application repository, **agent-uncle**. That repository
owns `supabase_migrations.schema_migrations` and the production migration sequence. This website repository
must never run `supabase db push`, `db reset` or `migration up` against the hosted project.
Canonical SQL here must be reviewed and incorporated into the shared app migration history before
production release. The 2026-10-17 rollout used explicitly selected SQL after comparing hosted
history and function definitions, not a blanket push from this repository's partial history.
Copies under `supabase-local/` are for the isolated Docker stack.

Do not blindly reapply the original backoffice baseline after newer app migrations: it replaces
command wrappers. The compatibility migration restores wrappers against the current app command
engine and must follow the complete prerequisite app schema. The local behaviour runner applies
both backoffice files in order inside a rolled-back transaction.

## Verification and rollout

1. Check the recorded app snapshot against the intended application release. Reconcile committed
   and uncommitted migration files; check hashes with `supabase-local/scripts/sync-migrations.sh`.
2. Run the local DB tests, app regression suites, API checks, unit tests, lint, typecheck, build and
   browser flows listed in [`../supabase-local/README.md`](../supabase-local/README.md).
3. In the app repository's release process, inspect actual deployed migration history. Ship all
   missing prerequisite app migrations through `202610160006`, then the compatibility migration.
   Existing landing/baseline entries must be reconciled with the real history; do not replay an
   old migration or use an old nine-migration allowlist as a shortcut.
4. Verify roles, app commands, invoice totals and the audit chain against that release before
   deploying the updated website. Website code expects the new RPCs and schema.
5. Smoke-test the console and app after deployment. Keep the new migration and matching website
   version together when planning rollback; financial/audit records must be preserved.

For the 2026-10-17 rollout, the DB steps and hosted read-only checks are complete. Website deployment
has not been verified. [`backoffice/hosted_checks.sql`](backoffice/hosted_checks.sql) checks required
history, nine RPCs and unauthorized access denials, private/service helper permissions, RLS, audit
chain integrity and request projections in a read-only transaction. It creates no customer fixtures
and does not impersonate staff. Use an authenticated CLI and explicitly select the intended project:

```sh
npx -y supabase@2.120.0 db query --linked \
  --project-ref auicerytbhnqeakmkscs \
  --file supabase/backoffice/hosted_checks.sql -o json
```

The detailed rollout record and source hashes are in the
[compatibility report](../docs/app-compatibility-2026-10-17.md). Do not run the local fixture-based
behaviour runner against production.

The new console supports receipt confirmation/rejection and recording completed uncle payouts.
It does **not execute bank transfers**. Team/convenience/lifecycle/push screens expose operational
records and diagnostics; they do not bypass the app's participant commands or automatically purge
accounts or retry push deliveries. Details are in the
[compatibility report](../docs/app-compatibility-2026-10-17.md).

## First owner and environment

For a new installation only, sign in once with the intended separate staff Google account so
`auth.users` exists with a confirmed email. Staff should have no app account. A trusted database
operator can create the first owner:

```sql
insert into public.backoffice_admins (user_id, role, display_name, require_mfa)
values ('<auth.users.id>', 'owner', '대표', false);
```

Set Vercel **Production** backoffice environment variables; leave Preview unset when the console
should stay disabled there:

- `BACKOFFICE_SUPABASE_TARGET=live`
- `BACKOFFICE_SUPABASE_URL` for the intended shared app project
- `BACKOFFICE_SUPABASE_PUBLISHABLE_KEY` for that project

The owner enrols TOTP, then a trusted database operator sets their `require_mfa=true`.
Do not repeat initial-owner provisioning for an existing installation. No service-role or secret
key belongs in the website environment.

The landing uses separate `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variables. Its `landing_leads` table permits only a fixed
column set for anonymous/authenticated inserts, with RLS and consent validation; the public key
cannot read or delete leads. The lead action maps a missing table to a temporary-unavailable
message. Local backoffice environment files do not override landing credentials.

## Files

- `migrations/20261011230000_landing_leads.sql`: landing lead collection.
- `backoffice/20261013090000_backoffice_admin_layer.sql`: original canonical console layer.
- `backoffice/20261017090000_app_compatibility.sql`: current application compatibility layer.
- `backoffice/backoffice_checks.sql`, `backoffice/run-checks.sh`: local-only behaviour and app
  regression checks. Run after changing canonical SQL.
- `backoffice/hosted_checks.sql`: read-only post-rollout checks for the explicitly selected project.

After editing canonical migrations, refresh local copies with
`supabase-local/scripts/sync-migrations.sh --copy` and repeat relevant checks.
