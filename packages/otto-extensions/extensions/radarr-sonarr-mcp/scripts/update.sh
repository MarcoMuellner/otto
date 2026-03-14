#!/usr/bin/env bash

set -euo pipefail

if [ -z "${OTTO_HOME:-}" ]; then
  echo "OTTO_HOME is not set" >&2
  exit 1
fi

repo_root="${OTTO_HOME}/integrations/radarr-sonarr-mcp/mcp_services_radarr_sonarr"

if [ ! -d "${repo_root}/.git" ]; then
  echo "radarr_sonarr_mcp checkout not found at ${repo_root}" >&2
  exit 1
fi

git -C "${repo_root}" pull --ff-only
cd "${repo_root}"
uv python install 3.13
uv sync --python 3.13 --link-mode=copy

# Upstream compatibility: current development branch imports FastMCP from the
# standalone package and references a config module that is not present.
# Patch both so runtime works against the locked `mcp` dependency.
python3 - "${repo_root}/radarr_sonarr_mcp/server.py" <<'PY'
from pathlib import Path
import sys

server_path = Path(sys.argv[1])
if server_path.exists():
    source = server_path.read_text()
    source = source.replace(
        "from fastmcp import FastMCP\n",
        "from mcp.server.fastmcp import FastMCP\n",
        1,
    )
    server_path.write_text(source)
PY

cat > "${repo_root}/radarr_sonarr_mcp/config.py" <<'PY'
from dataclasses import dataclass


@dataclass
class RadarrConfig:
    api_key: str
    base_path: str = "/api/v3"
    port: str = "7878"
    nas_ip: str = "127.0.0.1"

    @property
    def base_url(self) -> str:
        return f"http://{self.nas_ip}:{self.port}{self.base_path}"


@dataclass
class SonarrConfig:
    api_key: str
    base_path: str = "/api/v3"
    port: str = "8989"
    nas_ip: str = "127.0.0.1"

    @property
    def base_url(self) -> str:
        return f"http://{self.nas_ip}:{self.port}{self.base_path}"
PY
