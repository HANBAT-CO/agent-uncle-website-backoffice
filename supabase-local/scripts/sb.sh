#!/usr/bin/env bash
# Pinned Supabase CLI (2.120.0, as the app docs recommend) for the LOCAL backoffice stack only.
# Usage: supabase-local/scripts/sb.sh <supabase args...>    e.g. sb.sh status
# Always runs with --workdir supabase-local (project_id agent-uncle-backoffice, ports 553xx).
# Guards: never links, never targets a remote database, never touches other local stacks
# (the app's own stack "lisbon" on 543xx belongs to another workspace).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
  link|unlink|login|logout|projects|orgs|branches|secrets|functions|sso|domains|vanity-subdomains|network-bans|network-restrictions|ssl-enforcement|postgres-config|backups|snippets)
    echo "refusing: '$1' talks to the hosted platform; this wrapper is local-only" >&2; exit 2 ;;
esac
for arg in "$@"; do
  case "$arg" in
    --linked|--project-ref|--project-ref=*|--db-url|--db-url=*|--all|--project-id|--project-id=*)
      echo "refusing: $arg would target something other than this local stack" >&2; exit 2 ;;
  esac
done
if [[ "${1:-}" == "db" && "${2:-}" == "push" ]]; then echo "refusing: db push is not allowed here" >&2; exit 2; fi
exec npx -y supabase@2.120.0 --workdir "$here" "$@"
