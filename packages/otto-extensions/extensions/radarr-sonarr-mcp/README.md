# Radarr Sonarr MCP Extension

This extension wires the community Radarr/Sonarr MCP server
(`BerryKuipers/mcp_services_radarr_sonarr`) into Otto.

## What this installs

- MCP server entry: `mcp.radarr-sonarr`
- Skill: `radarr-sonarr-mcp-ops`

## Prerequisites

- `bash` available in PATH
- `git` available in PATH
- `uv` available in PATH
- Reachable Radarr and Sonarr instances

The extension uses lifecycle hooks:

- first install runs `scripts/install.sh` and clones/syncs upstream into
  `~/.otto/integrations/radarr-sonarr-mcp/mcp_services_radarr_sonarr`
- updates run `scripts/update.sh` and pull/sync upstream
- hooks install/sync with `uv --python 3.13`
- hooks apply upstream compatibility patches for current development branch

## Configure

Edit `~/.otto/integrations/radarr-sonarr-mcp/mcp_services_radarr_sonarr/.env`:

```dotenv
NAS_IP="127.0.0.1"
RADARR_PORT="7878"
RADARR_API_KEY="your-radarr-api-key"
RADARR_BASE_PATH="/api/v3"
SONARR_PORT="8989"
SONARR_API_KEY="your-sonarr-api-key"
SONARR_BASE_PATH="/api/v3"
MCP_SERVER_PORT="3000"
```

Notes:

- `NAS_IP` should be the host where Radarr and Sonarr APIs are reachable.
- Leave base paths at `/api/v3` unless your setup differs.

## Install

```bash
ottoctl extension install radarr-sonarr-mcp
```

If Otto is already running, restart it:

```bash
ottoctl restart
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.radarr-sonarr`.
- Check skill exists at
  `~/.otto/.opencode/skills/radarr-sonarr-mcp-ops/SKILL.md`.

## Troubleshooting

- If startup fails, verify `.env` has valid `RADARR_API_KEY` and `SONARR_API_KEY`.
- Verify Radarr/Sonarr are reachable from the Otto host on configured ports.
- If startup fails after an upstream update, run `ottoctl extension update radarr-sonarr-mcp`
  to re-apply compatibility patches.
- If upstream dependencies changed, run
  `uv sync --python 3.13 --link-mode=copy` in the integration checkout.
