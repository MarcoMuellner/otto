#!/usr/bin/env bash

set -euo pipefail

if [ -z "${OTTO_HOME:-}" ]; then
  echo "OTTO_HOME is not set" >&2
  exit 1
fi

integration_root="${OTTO_HOME}/integrations/emby-mcp"
repo_root="${integration_root}/Emby.MCP"

mkdir -p "${integration_root}"

if [ ! -d "${repo_root}/.git" ]; then
  git clone https://github.com/angeltek/Emby.MCP "${repo_root}"
fi

cd "${repo_root}"
uv python install 3.13
uv sync --python 3.13 --link-mode=copy

if [ ! -f ".env" ]; then
  cat > ".env" <<'EOF'
EMBY_SERVER_URL="http://localhost:8096"
EMBY_USERNAME=""
EMBY_PASSWORD=""
EMBY_VERIFY_SSL=True
LLM_MAX_ITEMS=100
EOF
fi
