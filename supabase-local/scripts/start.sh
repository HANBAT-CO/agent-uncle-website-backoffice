#!/usr/bin/env bash
# Start the LOCAL backoffice stack (idempotent): pin service versions to live, start, apply the
# platform-parity SQL, refresh the gitignored env files. Data persists in Docker volumes.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$here/pin-versions.sh"
"$here/sb.sh" start
"$here/psql.sh" -q -f - < "$here/../platform/rls_auto_enable.sql" >/dev/null
node "$here/write-env.mjs"
