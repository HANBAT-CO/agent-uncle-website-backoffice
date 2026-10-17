#!/usr/bin/env bash
# Keep the copied migrations in sync with their sources (copies, never symlinks).
#   sync-migrations.sh            check only: report missing / changed / extra files (exit 1 on drift)
#   sync-migrations.sh --copy     copy new or changed source files in, then re-check
# Sources (read-only):
#   app repo    $APP_SUPABASE_DIR/migrations/*.sql  (default: the agent-uncle "lisbon" workspace)
#               Only migrations pinned in SNAPSHOT_APP below are copied for local compatibility testing;
#               unlisted migrations are reported as unpinned. This does not describe live deployment state.
#               $APP_SUPABASE_DIR/config.toml is NOT re-copied: ours carries the port/project deltas.
#               20261013090000_* is skipped there: its source is this repo (below).
#   this repo   supabase/migrations/20261011230000_landing_leads.sql
#               supabase/backoffice/[0-9]*.sql (canonical backoffice layers;
#               local copies must stay byte-equal to their sources)
# After --copy use the isolated local reset.sh and current regression checks in README.md.
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
# App working-tree compatibility snapshot, 2026-10-17; not a live deployment claim.
SNAPSHOT_APP=(
  202610110001_workspace.sql
  202610110002_commands.sql
  202610110003_snapshot_integrity.sql
  202610110004_profile_validation_messages.sql
  202610110005_optional_profile_details.sql
  202610110006_signup_role_profile_validation.sql
  202610120001_signup_phone_availability.sql
  202610130000_chat_message_actions_hotfix.sql
  202610130001_partner_directory.sql
  202610130002_chat_message_actions.sql
  202610130003_chat_content_filter.sql
  202610130004_wholesaler_requests.sql
  202610140001_account_deletion.sql
  202610140002_chat_user_blocks.sql
  202610150001_workflow_access.sql
  202610150002_billing.sql
  202610150003_team_work.sql
  202610150004_convenience.sql
  202610150005_workflow_projection.sql
  202610150006_push_notifications.sql
  202610150007_workflow_participants.sql
  202610150008_release_visibility.sql
  202610160001_order_payment.sql
  202610160002_private_function_permissions.sql
  202610160003_order_flow.sql
  202610160004_invoice_final_amount.sql
  202610160005_wholesaler_batch_proposals.sql
  202610160006_order_completion_confirmation.sql
)
is_snapshot() { local n; for n in "${SNAPSHOT_APP[@]}"; do [[ "$n" == "$1" ]] && return 0; done; return 1; }
drift=0
sources=()
for f in "$app"/migrations/*.sql; do
  [[ -e "$f" ]] || continue
  name="$(basename "$f")"
  case "$name" in
    20261013090000_*) echo "skip     $name (app copy; the source is supabase/backoffice/)" ;;
    20261011230000_*) echo "skip     $name (app copy; the source is supabase/migrations/)" ;;
    *) if is_snapshot "$name"; then sources+=("$f"); else echo "unpinned $name (not copied)"; fi ;;
  esac
done
for n in "${SNAPSHOT_APP[@]}"; do
  [[ -f "$app/migrations/$n" ]] || { echo "source missing: $app/migrations/$n" >&2; exit 2; }
done
sources+=("$repo/supabase/migrations/20261011230000_landing_leads.sql")
for f in "$repo"/supabase/backoffice/[0-9]*.sql; do sources+=("$f"); done
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
