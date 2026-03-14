---
id: extensions
title: Extension Commands
description: List, install, update, disable, and remove Otto extensions.
---

Extension commands manage extension lifecycle in local Otto extension storage.

## Commands

- `ottoctl extension list`
- `ottoctl extension install <id>[@version]`
- `ottoctl extension update <id>`
- `ottoctl extension update --all`
- `ottoctl extension disable <id>`
- `ottoctl extension remove <id>[@version]`

## Behavior Notes

- `install`/`update` activate extension tools and skills into `~/.otto/.opencode`.
- `install`/`update` prune older installed versions per extension id.
- `disable` removes active extension footprint from runtime/state.
- Extensions can declare optional setup hooks in `payload.hooks`.
- `payload.hooks.install` runs only on first install for an extension id.
- `payload.hooks.update` runs only when installed version changes.
- Hook failures are soft-fail: Otto logs a warning and continues install/update.

## Examples

```bash
ottoctl extension list
ottoctl extension install opencode-terminal
ottoctl extension install opencode-terminal@0.1.0
ottoctl extension update opencode-terminal
ottoctl extension update --all
ottoctl extension disable opencode-terminal
ottoctl extension remove opencode-terminal@0.1.0
```

## Example Extension

- `opencode-terminal` installs a terminal-operations skill for OpenCode itself.
- After install, verify `~/.otto/.opencode/skills/opencode-terminal/SKILL.md` exists.
- If Otto is already running, restart it so skill discovery refreshes.

- `emby-mcp` installs the Emby MCP server wiring plus an Emby operations skill.
- After install, verify `~/.otto/opencode.jsonc` has `mcp.emby`.
- Verify `~/.otto/.opencode/skills/emby-mcp-ops/SKILL.md` exists.

## Failure Modes

- Unknown extension subcommands fail with non-zero exit.
- Invalid argument shape fails with usage guidance.
