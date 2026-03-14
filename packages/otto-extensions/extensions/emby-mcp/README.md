# Emby MCP Extension

This extension wires the community Emby MCP server (`angeltek/Emby.MCP`) into Otto.

## What this installs

- MCP server entry: `mcp.emby`
- Skill: `emby-mcp-ops`

## Prerequisites

- `bash` available in PATH
- `uv` available in PATH
- Python 3.13+ available for Emby.MCP
- Local checkout of Emby.MCP at `~/.otto/integrations/emby-mcp/Emby.MCP`
- Emby.MCP `.env` file at `~/.otto/integrations/emby-mcp/Emby.MCP/.env`

Recommended setup:

```bash
mkdir -p ~/.otto/integrations/emby-mcp
git clone https://github.com/angeltek/Emby.MCP ~/.otto/integrations/emby-mcp/Emby.MCP
cd ~/.otto/integrations/emby-mcp/Emby.MCP
uv sync --link-mode=copy
```

Create `.env` in the Emby checkout:

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

If Otto is already running, restart it:

```bash
ottoctl restart
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.emby`.
- Check skill exists at `~/.otto/.opencode/skills/emby-mcp-ops/SKILL.md`.

## Troubleshooting

- If startup fails, verify `~/.otto/integrations/emby-mcp/Emby.MCP/.env` exists.
- If `uv` is missing, install it and ensure it is on PATH.
- If server auth fails, verify Emby credentials and URL in the `.env` file.
- If Emby.MCP dependencies changed upstream, run `uv sync --link-mode=copy` in the Emby checkout.
