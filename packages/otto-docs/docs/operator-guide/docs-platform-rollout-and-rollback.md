---
id: docs-platform-rollout-and-rollback
title: Docs Platform Rollout and Rollback Runbook
description: Release checklist and rollback steps for docs platform incidents.
---

Use this runbook for docs platform releases and incidents involving
static-vs-live boundary safety.

## Preconditions

- Release artifact built from the intended tag.
- External API token auth works in deployed runtime.
- `ottoctl doctor` is green before rollout.

## Rollout Checklist

1. Confirm release version and docs tag:

```bash
ottoctl --version
```

1. Update runtime to target release channel/tag policy:

```bash
ottoctl update
```

1. Validate service status and runtime baseline:

```bash
ottoctl doctor
ottoctl task list
ottoctl model list
```

1. Validate operator docs journey:

- Open static docs root and `/docs/intro`.
- Confirm live route requires token (`/api/live/self-awareness` returns
  `auth_required` without bearer token).
- Confirm valid token returns live runtime payload.

1. Validate Otto self-query journey:

- Trigger docs search/open via internal tools (`docs_search`, `docs_open`).
- Confirm `/live` open includes live data when token is available.

## Incident Triggers

Start rollback if any of these occur:

- Public static surface exposes live runtime endpoint hooks.
- Live endpoint auth checks fail open.
- Live endpoint returns sustained `upstream_unreachable` after runtime restart.
- Docs search/open tool flow fails for operator-critical pages.

## Rollback Procedure

1. Contain first:

- Stop rollout traffic and pause further updates.
- Prefer public static docs surface for operator guidance while live issues
  are triaged.

1. Revert runtime to last known good release channel/tag:

```bash
ottoctl update --repo <owner>/<repo>
```

Use your release policy source to select the last known good stable artifact.

1. Restart and verify:

```bash
ottoctl restart
ottoctl doctor
```

1. Re-run docs smoke checks:

- Static docs routes load.
- Live endpoint requires bearer token.
- Valid token returns payload.
- Otto docs search/open tool flow succeeds.

## Post-Rollback Evidence

- Capture `ottoctl doctor` output.
- Capture failing and recovered endpoint status codes.
- Record incident timeline and release identifiers in your incident note.

## Related References

- [Static Docs vs Live Docs Surface](./docs-surface-static-vs-live.md)
- [Incident Triage](./incident-triage.md)
- [Update Workflow](./update-workflow.md)
