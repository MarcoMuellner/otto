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
