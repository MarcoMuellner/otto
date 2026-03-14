#!/usr/bin/env bash

set -euo pipefail

if [ -z "${OTTO_HOME:-}" ]; then
  echo "OTTO_HOME is not set" >&2
  exit 1
fi

repo_root="${OTTO_HOME}/integrations/emby-mcp/Emby.MCP"

if [ ! -d "${repo_root}/.git" ]; then
  echo "Emby.MCP checkout not found at ${repo_root}" >&2
  exit 1
fi

git -C "${repo_root}" pull --ff-only
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
