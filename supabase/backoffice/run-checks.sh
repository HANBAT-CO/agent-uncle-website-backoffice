#!/usr/bin/env bash
# Behaviour checks for the canonical backoffice layers, LOCAL stack only (supabase-local).
# Applies both migrations in order twice (idempotency) and backoffice_checks.sql inside BEGIN ... ROLLBACK,
# so the local database is left exactly as it was. Never point this at the live project.
#   supabase/backoffice/run-checks.sh            behaviour checks (expects the demo seed)
#   supabase/backoffice/run-checks.sh --app <dir> also run the app's pgTAP files from <dir> with the layer applied
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql_local="$here/../../supabase-local/scripts/psql.sh"
apply_layers() {
  for migration in "$here"/[0-9]*.sql; do
    sed -E '/^[[:space:]]*([Bb][Ee][Gg][Ii][Nn]|[Cc][Oo][Mm][Mm][Ii][Tt]);[[:space:]]*$/d' "$migration"
  done
}
out="$({ echo "begin;"; apply_layers; apply_layers; cat "$here/backoffice_checks.sql"; echo "rollback;"; } | "$psql_local" -q -t -f - 2>&1)" || { printf '%s\n' "$out" | grep -E "FAIL|ERROR" >&2; exit 1; }
printf '%s\n' "$out" | grep -E "^ PASS|ALL CHECKS" | sed 's/^ //'
printf '%s\n' "$out" | grep -q "ALL CHECKS PASSED"
if [[ "${1:-}" == "--app" && -n "${2:-}" ]]; then
  for f in "$2"/*.sql; do
    res="$({ echo "begin; create extension if not exists pgtap with schema extensions; set search_path = public, extensions;"; apply_layers; cat "$f"; } | "$psql_local" -q -t -f - 2>&1)" || { printf '%s\n' "$res" | tail -40 >&2; exit 1; }
    ok=$(printf '%s\n' "$res" | grep -c '^ ok ' || true); bad=$(printf '%s\n' "$res" | grep -c 'not ok' || true)
    echo "$(basename "$f"): $ok ok, $bad not ok"
    [[ "$bad" == "0" && "$ok" -gt 0 ]] || { printf '%s\n' "$res" | grep -A5 "not ok" >&2; exit 1; }
  done
fi
