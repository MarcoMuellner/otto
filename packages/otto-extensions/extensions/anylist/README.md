# AnyList Tools Extension

This extension adds a direct AnyList tool and usage skill (no MCP sidecar required).

## What this installs

- Tool: `anylist`
- Skill: `anylist-ops`

## Prerequisites

Set AnyList credentials in Otto runtime env:

```bash
ottoctl env set ANYLIST_EMAIL '<your-anylist-email>'
ottoctl env set ANYLIST_PASSWORD '<your-anylist-password>'
```

## Install

```bash
ottoctl extension install anylist
```

If Otto is already running, restart to reload tools/skills:

```bash
ottoctl restart
```

## Verify

- Tool exists under `~/.otto/.opencode/tools/extensions/anylist/anylist.ts`.
- Skill exists at `~/.otto/.opencode/skills/anylist-ops/SKILL.md`.
