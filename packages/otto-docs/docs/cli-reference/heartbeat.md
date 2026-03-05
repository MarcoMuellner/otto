---
id: heartbeat
title: Heartbeat Commands
description: Inspect and control runtime heartbeat delivery mode.
---

Heartbeat commands update and inspect delivery behavior in the runtime profile.

## Commands

### `ottoctl heartbeat status`

Prints current mode and profile fields.

### `ottoctl heartbeat mode <observe|mute>`

Sets heartbeat mode:

- `observe`: always send compact updates
- `mute`: suppress normal heartbeats

## Examples

```bash
ottoctl heartbeat status
ottoctl heartbeat mode observe
ottoctl heartbeat mode mute
```

## Failure Modes

- Unknown mode values are rejected.
- Missing state database fails with setup/update guidance.
