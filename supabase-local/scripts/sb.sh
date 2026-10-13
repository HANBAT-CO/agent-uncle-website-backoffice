#!/usr/bin/env bash
# Pinned Supabase CLI for the LOCAL backoffice stack only.
# Usage: supabase-local/scripts/sb.sh <supabase args...>   e.g. sb.sh status
# Always runs against supabase-local/ (never linked to the live project).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
  link|unlink|login) echo "refusing: this wrapper is local-only" >&2; exit 2 ;;
esac
for arg in "$@"; do
  case "$arg" in
    --linked|--project-ref*|--db-url*) echo "refusing: $arg would target a non-local database" >&2; exit 2 ;;
  esac
done
if [[ "${1:-}" == "db" && "${2:-}" == "push" ]]; then echo "refusing: db push is not allowed here" >&2; exit 2; fi
exec npx -y supabase@2.120.0 --workdir "$here" "$@"
