#!/usr/bin/env bash
# Stop the LOCAL backoffice stack only (data volumes are kept; start.sh brings it back as it was).
# Pass --no-backup to also delete this stack's volumes. Never stops other stacks (no --all).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$here/sb.sh" stop "$@"
