#!/usr/bin/env bash
# Pin local service images to the versions the live project runs (same pins the
# app repo's linked .temp uses). The CLI reads these files from supabase/.temp
# (gitignored). Re-check with: scripts/verify-schema.mjs (prints live versions).
set -euo pipefail
tmp="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/.temp"
mkdir -p "$tmp"
printf '%s' '17.11.0.003'                 > "$tmp/postgres-version"
printf '%s' 'v2.197.0'                    > "$tmp/gotrue-version"
printf '%s' 'v14.18'                      > "$tmp/rest-version"
printf '%s' 'v1.80.2'                     > "$tmp/storage-version"
printf '%s' 'drop-bucketid-objname-index' > "$tmp/storage-migration"
echo "pinned: postgres 17.11.0.003, gotrue v2.197.0, postgrest v14.18, storage v1.80.2"
