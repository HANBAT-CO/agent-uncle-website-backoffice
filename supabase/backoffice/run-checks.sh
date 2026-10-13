#!/usr/bin/env bash
# Behaviour checks for the PROPOSED backoffice layer, LOCAL stack only (supabase-local).
# Applies the migration twice (idempotency) and backoffice_checks.sql inside BEGIN ... ROLLBACK,
# so the local database is left exactly as it was. Never point this at the live project.
#   supabase/backoffice/run-checks.sh            behaviour checks (expects the demo seed)
#   supabase/backoffice/run-checks.sh --app <dir> also run the app's pgTAP files from <dir> with the layer applied
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql_local="$here/../../supabase-local/scripts/psql.sh"
migration="$here/20261013090000_backoffice_admin_layer.sql"
out="$({ echo "begin;"; cat "$migration" "$migration" "$here/backoffice_checks.sql"; echo "rollback;"; } | "$psql_local" -q -t -f - 2>&1)" || { printf '%s\n' "$out" | grep -E "FAIL|ERROR" >&2; exit 1; }
printf '%s\n' "$out" | grep -E "^ PASS|ALL CHECKS" | sed 's/^ //'
printf '%s\n' "$out" | grep -q "ALL CHECKS PASSED"
if [[ "${1:-}" == "--app" && -n "${2:-}" ]]; then
  for f in "$2"/*.sql; do
    res="$({ echo "begin;"; cat "$migration"; cat "$f"; } | "$psql_local" -q -t -f - 2>&1)"
    ok=$(printf '%s\n' "$res" | grep -c '^ ok ' || true); bad=$(printf '%s\n' "$res" | grep -c 'not ok' || true)
    echo "$(basename "$f"): $ok ok, $bad not ok"
    [[ "$bad" == "0" ]] || exit 1
  done
fi
