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

## Failure Modes

- Unknown extension subcommands fail with non-zero exit.
- Invalid argument shape fails with usage guidance.
