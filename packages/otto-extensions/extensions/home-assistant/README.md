# Home Assistant MCP Extension

This extension adds Home Assistant MCP connectivity and a smart-home operations skill.

## What this installs

- MCP server gateway via `mcp-proxy`
- Skill: `home-assistant-ops`

## Reference docs

- Home Assistant MCP integration docs: `https://www.home-assistant.io/integrations/mcp_server/`

## Prerequisites

- Home Assistant MCP integration enabled at `/api/mcp`
- `mcp-proxy` installed and available in PATH
- Environment variables exported on the Otto host:
  - `HOME_ASSISTANT_MCP_URL` (for example `http://localhost:8123/api/mcp`)
  - `HOME_ASSISTANT_API_ACCESS_TOKEN` (Home Assistant long-lived access token)

If you keep these in `~/.bashrc`, ensure they are exported before starting Otto.

## Install

```bash
ottoctl extension install home-assistant
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart the service to reload OpenCode config:

```bash
ottoctl stop
ottoctl start
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.home-assistant`.
- Check skill exists at `~/.otto/.opencode/skills/home-assistant-ops/SKILL.md`.

## Troubleshooting

- If connect fails, verify `HOME_ASSISTANT_MCP_URL` points to a reachable Home Assistant instance.
- If auth fails, verify `HOME_ASSISTANT_API_ACCESS_TOKEN` is valid.
- If proxy command fails, ensure `mcp-proxy` is installed and executable.
