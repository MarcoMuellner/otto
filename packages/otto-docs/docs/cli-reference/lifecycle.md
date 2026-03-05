---
id: lifecycle
title: Lifecycle Commands
description: Start, restart, and stop Otto user services.
---

These commands manage installed Otto services in user context.

## Commands

### `ottoctl start`

Installs/refreshes service definitions and starts available services.

### `ottoctl restart`

Installs/refreshes service definitions, then restarts available services.

### `ottoctl stop`

Stops Otto services.

## Managed Services

When artifacts are present in the installed release, lifecycle commands manage:

- `otto` runtime service
- `otto-control-plane` service
- `otto-docs-service` service

If control-plane/docs artifacts are missing in a release, `ottoctl` skips those
services and keeps runtime lifecycle behavior intact.

## Examples

```bash
ottoctl start
ottoctl restart
ottoctl stop
```

## Verification

- `ottoctl doctor`
- Open control-plane UI and docs service URL
- Confirm runtime logs show expected startup/shutdown sequence
