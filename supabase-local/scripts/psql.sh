#!/usr/bin/env bash
# psql as postgres inside the LOCAL db container (no local psql needed).
#   psql.sh                      interactive
#   psql.sh -c "select 1"        one statement
#   psql.sh -f - < file.sql      a file
set -euo pipefail
tty=(); [[ -t 0 && $# -eq 0 ]] && tty=(-t)
exec docker exec -i ${tty[@]+"${tty[@]}"} supabase_db_agent-uncle-backoffice psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
