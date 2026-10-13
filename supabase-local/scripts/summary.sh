#!/usr/bin/env bash
# Print the read-only overview of the LOCAL demo data (status labels, invariants, counts).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$here/psql.sh" -P pager=off -f - < "$here/../seed/summary.sql"
