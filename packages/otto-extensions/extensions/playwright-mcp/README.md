# Playwright MCP Extension

This extension adds a Playwright MCP server and a browser automation skill for OpenCode.

## What this installs

- MCP server: `@playwright/mcp` (launched via `npx`)
- Skill: `playwright-mcp-browse`

## Prerequisites

- Node.js >= 22
- `npx` available in PATH
- Playwright browser binaries (can be installed on first use via `browser_install`)

## Install

From the Otto host:

```bash
ottoctl extension install playwright-mcp
```

Install activates immediately in the runtime footprint.

On first real browser use, if the Playwright binary is missing, run:

```text
browser_install
```

If Otto is already running, restart the service to reload OpenCode config:

```bash
ottoctl stop
ottoctl start
```

## Verify

- Check MCP entry exists in `~/.otto/opencode.jsonc` under `mcp.playwright`.
- Check skill exists at `~/.otto/.opencode/skills/playwright-mcp-browse/SKILL.md`.

## Troubleshooting

- If browser tools fail due to missing browser binaries, call `browser_install` once.
- If `npx` is not found, install Node.js and ensure your runtime PATH includes npm binaries.
