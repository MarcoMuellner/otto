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
ottoctl extension install weather
ottoctl extension install weather@1.2.0
ottoctl extension update weather
ottoctl extension update --all
ottoctl extension disable weather
ottoctl extension remove weather@1.2.0
```

## Failure Modes

- Unknown extension subcommands fail with non-zero exit.
- Invalid argument shape fails with usage guidance.
