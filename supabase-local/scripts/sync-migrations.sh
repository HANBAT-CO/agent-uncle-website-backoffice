#!/usr/bin/env bash
# Keep the copied migrations in sync with their sources (copies, never symlinks).
#   sync-migrations.sh            check only: report missing / changed / extra files (exit 1 on drift)
#   sync-migrations.sh --copy     copy new or changed source files in, then re-check
# Sources (read-only):
#   app repo    $APP_SUPABASE_DIR/migrations/*.sql  (default: the agent-uncle "lisbon" workspace)
#               Only the migrations listed in LIVE_APP below: the stack mirrors the LIVE project, so
#               app migrations that are not on live yet are reported as "not live" and never copied.
#               $APP_SUPABASE_DIR/config.toml is NOT re-copied: ours carries the port/project deltas.
#               20261013090000_* is skipped there: its source is this repo (below).
#   this repo   supabase/migrations/20261011230000_landing_leads.sql
#               supabase/backoffice/20261013090000_backoffice_admin_layer.sql (canonical, PROPOSED layer;
#               the local copy must stay byte-equal to it)
# After --copy run reset.sh, then verify-schema.mjs.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"
app="${APP_SUPABASE_DIR:-/Users/edmond104/conductor/workspaces/agent-uncle/lisbon/supabase}"
dest="$here/supabase/migrations"
mode="${1:-check}"
case "$mode" in
  check | --copy) ;;
  *) echo "usage: $0 [--copy]" >&2; exit 2 ;;
esac
[[ -d "$app/migrations" ]] || { echo "app migrations not found: $app/migrations (set APP_SUPABASE_DIR)" >&2; exit 2; }
# App migrations recorded on LIVE (supabase_migrations.schema_migrations, read 2026-10-14). Add a name
# once it is on live; verify-schema.mjs reports a live migration that is missing here ("only live").
LIVE_APP=(
  202610110001_workspace.sql
  202610110002_commands.sql
  202610110003_snapshot_integrity.sql
  202610110004_profile_validation_messages.sql
  202610110005_optional_profile_details.sql
  202610110006_signup_role_profile_validation.sql
  202610120001_signup_phone_availability.sql
  202610130000_chat_message_actions_hotfix.sql
  202610130004_wholesaler_requests.sql
)
is_live() { local n; for n in "${LIVE_APP[@]}"; do [[ "$n" == "$1" ]] && return 0; done; return 1; }
drift=0
sources=()
for f in "$app"/migrations/*.sql; do
  [[ -e "$f" ]] || continue
  name="$(basename "$f")"
  case "$name" in
    20261013090000_*) echo "skip     $name (app copy; the source is supabase/backoffice/)" ;;
    20261011230000_*) echo "skip     $name (app copy; the source is supabase/migrations/)" ;;
    *) if is_live "$name"; then sources+=("$f"); else echo "not live $name (not copied)"; fi ;;
  esac
done
for n in "${LIVE_APP[@]}"; do
  [[ -f "$app/migrations/$n" ]] || { echo "source missing: $app/migrations/$n" >&2; exit 2; }
done
sources+=("$repo/supabase/migrations/20261011230000_landing_leads.sql")
sources+=("$repo/supabase/backoffice/20261013090000_backoffice_admin_layer.sql")
for src in "${sources[@]}"; do
  [[ -f "$src" ]] || { echo "source missing: $src" >&2; exit 2; }
  name="$(basename "$src")"
  if [[ ! -f "$dest/$name" ]]; then
    echo "missing  $name"; drift=1
    [[ "$mode" == "--copy" ]] && cp "$src" "$dest/$name" && echo "  copied"
  elif ! cmp -s "$src" "$dest/$name"; then
    echo "changed  $name"; drift=1
    [[ "$mode" == "--copy" ]] && cp "$src" "$dest/$name" && echo "  copied"
  else
    echo "same     $name  $(shasum -a 256 "$src" | cut -c1-12)"
  fi
done
for f in "$dest"/*.sql; do
  [[ -e "$f" ]] || continue
  name="$(basename "$f")"
  found=0; for src in "${sources[@]}"; do [[ "$(basename "$src")" == "$name" ]] && found=1; done
  [[ $found == 0 ]] && { echo "extra    $name (no source any more)"; drift=1; }
done
if [[ "$mode" == "--copy" ]]; then exec "$0"; fi
exit $drift
