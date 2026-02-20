# Brave Search MCP Extension

This extension adds Brave Search MCP tools and a lightweight search workflow skill.

## What this installs

- MCP server: `@brave/brave-search-mcp-server` (launched via `npx`)
- Skill: `brave-search-ops`

## Prerequisites

- Node.js >= 22
- `npx` available in PATH
- Brave Search API key configured in Otto runtime env:

```bash
ottoctl env set BRAVE_API_KEY '<your-brave-api-key>'
```

## Install

From the Otto host:

```bash
ottoctl extension install brave-search
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart to reload OpenCode config:

```bash
ottoctl restart
```

## Verify

- Check MCP entry exists in `~/.otto/.opencode/opencode.jsonc` under `mcp.brave-search`.
- Check skill exists at `~/.otto/.opencode/skills/brave-search-ops/SKILL.md`.

## Troubleshooting

- If startup fails, ensure `BRAVE_API_KEY` is set and non-empty in runtime env.
- If command resolution fails, verify `npx` is available to the Otto service PATH.
