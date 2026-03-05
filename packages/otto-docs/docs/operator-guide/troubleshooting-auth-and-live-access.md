---
id: troubleshooting-auth-and-live-access
title: Troubleshooting Auth and Live Access
description: Resolve token auth and live docs proxy failures safely.
---

Use this page when deployed live docs or model/task API-backed commands fail due
to auth/connectivity issues.

## Symptoms

- Live docs page shows token rejected or auth required
- Live docs proxy returns `auth_required` or `upstream_unreachable`
- Model/task set-model commands fail with external API auth/connectivity errors

## Checks

1. Confirm token source and path:

```bash
ottoctl env list
```

1. Confirm runtime surfaces are reachable:

```bash
ottoctl doctor
```

1. Retry live docs token entry in `/live` (deployed surface).

## Common Causes

- Missing/expired bearer token
- Token file is empty or unreadable
- External API host/port mismatch
- Docs service cannot reach external API endpoint

## Recovery Actions

```bash
ottoctl restart
ottoctl doctor
```

Then validate:

- Live docs `/api/live/self-awareness` returns data with valid bearer token
- `ottoctl model list` succeeds

## Related References

- [Static Docs vs Live Docs Surface](./docs-surface-static-vs-live.md)
- [Model Commands](../cli-reference/models.md)
