#!/usr/bin/env bash

set -euo pipefail

if [ -z "${OTTO_HOME:-}" ]; then
  echo "OTTO_HOME is not set" >&2
  exit 1
fi

integration_root="${OTTO_HOME}/integrations/radarr-sonarr-mcp"
repo_root="${integration_root}/mcp_services_radarr_sonarr"

mkdir -p "${integration_root}"

if [ ! -d "${repo_root}/.git" ]; then
  git clone https://github.com/BerryKuipers/mcp_services_radarr_sonarr "${repo_root}"
fi

cd "${repo_root}"
uv python install 3.13
uv sync --python 3.13 --link-mode=copy

if [ ! -f ".env" ]; then
  cat > ".env" <<'EOF'
NAS_IP="127.0.0.1"
RADARR_PORT="7878"
RADARR_API_KEY=""
RADARR_BASE_PATH="/api/v3"
SONARR_PORT="8989"
SONARR_API_KEY=""
SONARR_BASE_PATH="/api/v3"
MCP_SERVER_PORT="3000"
EOF
fi
