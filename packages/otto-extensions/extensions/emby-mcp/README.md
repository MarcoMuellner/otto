# Emby MCP Extension

This extension wires the community Emby MCP server (`angeltek/Emby.MCP`) into Otto.

## What this installs

- MCP server entry: `mcp.emby`
- Skill: `emby-mcp-ops`

## Prerequisites

- `bash` available in PATH
- `git` available in PATH
- `uv` available in PATH
- Python 3.13+ available for Emby.MCP

The extension uses lifecycle hooks:

- first install runs `scripts/install.sh` and clones/syncs Emby.MCP into `~/.otto/integrations/emby-mcp/Emby.MCP`
- updates run `scripts/update.sh` and pull/sync Emby.MCP
- hooks install/sync with `uv --python 3.13` to avoid upstream build breakage on Python 3.14

You can still set up manually if you prefer.

Manual setup (optional):

```bash
mkdir -p ~/.otto/integrations/emby-mcp
git clone https://github.com/angeltek/Emby.MCP ~/.otto/integrations/emby-mcp/Emby.MCP
cd ~/.otto/integrations/emby-mcp/Emby.MCP
uv sync --python 3.13 --link-mode=copy
```

Update `.env` in the Emby checkout with your real values:

```dotenv
EMBY_SERVER_URL="http://localhost:8096"
EMBY_USERNAME="user"
EMBY_PASSWORD="pass"
EMBY_VERIFY_SSL=True
LLM_MAX_ITEMS=100
```

## Install

```bash
ottoctl extension install emby-mcp
```

On first install, Otto runs the install hook and creates a `.env` template if one is missing.

If Otto is already running, restart it:

```bash
ottoctl restart
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.emby`.
- Check skill exists at `~/.otto/.opencode/skills/emby-mcp-ops/SKILL.md`.

## Troubleshooting

- If startup fails, verify `~/.otto/integrations/emby-mcp/Emby.MCP/.env` exists and has valid credentials.
- If `uv` is missing, install it and ensure it is on PATH.
- If `git` is missing, install it and ensure it is on PATH.
- If server auth fails, verify Emby credentials and URL in the `.env` file.
- If Emby.MCP dependencies changed upstream, run `uv sync --python 3.13 --link-mode=copy` in the Emby checkout.
