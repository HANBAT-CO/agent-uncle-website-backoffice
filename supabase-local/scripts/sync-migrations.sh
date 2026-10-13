#!/usr/bin/env bash
# Keep the copied migrations in sync with their sources (copies, never symlinks).
#   sync-migrations.sh            check only: report missing / changed / extra files (exit 1 on drift)
#   sync-migrations.sh --copy     copy new or changed source files in, then re-check
# Sources (read-only):
#   app repo    $APP_SUPABASE_DIR/migrations/*.sql  (default: the agent-uncle "lisbon" workspace)
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
drift=0
sources=()
for f in "$app"/migrations/*.sql; do
  [[ -e "$f" ]] || continue
  case "$(basename "$f")" in
    20261013090000_*) echo "skip     $(basename "$f") (app copy; the source is supabase/backoffice/)" ;;
    *) sources+=("$f") ;;
  esac
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
