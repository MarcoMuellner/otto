# Google Calendar MCP Extension

This extension adds Google Calendar MCP tooling and a scheduling-focused skill.

## What this installs

- MCP server: `@cocal/google-calendar-mcp` (launched via `npx`)
- Skill: `google-calendar-ops`

## Prerequisites

- Node.js >= 22
- `npx` available in PATH
- OAuth credentials file at `~/.otto/secrets/gcp-oauth.keys.json`

## Install

From the Otto host:

```bash
ottoctl extension install google-calendar
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart the service to reload OpenCode config:

```bash
ottoctl stop
ottoctl start
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.gcal`.
- Check skill exists at `~/.otto/.opencode/skills/google-calendar-ops/SKILL.md`.

## Troubleshooting

- If auth fails, verify `~/.otto/secrets/gcp-oauth.keys.json` exists and is valid.
- If `npx` is not found, install Node.js and ensure npm binaries are on PATH.
