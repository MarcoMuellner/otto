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

python3 - "${repo_root}/lib_emby_functions.py" <<'PY'
from pathlib import Path
import sys

target = Path(sys.argv[1])
if not target.exists():
    print(f"Emby auth hotfix skipped: {target} not found.", file=sys.stderr)
    raise SystemExit(0)

source = target.read_text()
legacy_line = "        e_api_client.configuration.api_key['access_token'] = access_token\n"
fixed_line = (
    "        e_api_client.configuration.api_key['access_token'] = access_token\n"
    "        e_api_client.configuration.api_key['api_key'] = access_token\n"
)

if "configuration.api_key['api_key'] = access_token" in source:
    print("Emby auth hotfix already present.")
    raise SystemExit(0)

if legacy_line not in source:
    print("Emby auth hotfix skipped: expected auth token assignment not found.", file=sys.stderr)
    raise SystemExit(0)

target.write_text(source.replace(legacy_line, fixed_line, 1))
print("Applied Emby auth token compatibility hotfix.")
PY

if [ ! -f ".env" ]; then
  cat > ".env" <<'EOF'
EMBY_SERVER_URL="http://localhost:8096"
EMBY_USERNAME=""
EMBY_PASSWORD=""
EMBY_VERIFY_SSL=True
LLM_MAX_ITEMS=100
EOF
fi
