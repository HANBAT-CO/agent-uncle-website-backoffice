#!/usr/bin/env bash
# Start the LOCAL backoffice stack (idempotent): pin service versions to live, start, apply the
# platform-parity SQL, refresh the gitignored env files. Data persists in Docker volumes.
# The CLI's own output (which lists the local keys) goes to supabase/.temp/start.log, not the terminal.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log="$here/../supabase/.temp/start.log"
"$here/pin-versions.sh"
mkdir -p "$(dirname "$log")"
if ! "$here/sb.sh" start > "$log" 2>&1; then
  grep -v -E 'KEY|SECRET|JWT' "$log" >&2 || true
  echo "supabase start failed (full log: $log)" >&2
  exit 1
fi
"$here/psql.sh" -q -f - < "$here/../platform/rls_auto_enable.sql" >/dev/null
node "$here/write-env.mjs"
