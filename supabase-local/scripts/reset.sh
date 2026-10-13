#!/usr/bin/env bash
# Rebuild the LOCAL database from the copied migrations and load the demo data.
#   reset.sh            db reset + platform parity + demo seed + backoffice staff seed + summary
#   reset.sh --empty    db reset + platform parity only (schema, no data, no staff)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$here/sb.sh" db reset --local --no-seed
"$here/psql.sh" -q -f - < "$here/../platform/rls_auto_enable.sql" >/dev/null
node "$here/write-env.mjs" >/dev/null
if [[ "${1:-}" == "--empty" ]]; then echo "local DB reset (no demo data)"; exit 0; fi
node "$here/../seed/demo.mjs"
node "$here/../seed/backoffice-staff.mjs"
"$here/summary.sh"
