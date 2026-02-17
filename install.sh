#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible installer entrypoint.
# Delegates to the monorepo location introduced in the workspace migration.
exec "$(cd "$(dirname "$0")" && pwd)/packages/otto/install.sh" "$@"
