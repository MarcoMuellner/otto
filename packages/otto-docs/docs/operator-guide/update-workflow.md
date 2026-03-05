---
id: update-workflow
title: Update Workflow
description: Safe release update flow for stable, nightly, and PR artifacts.
---

## Update Channels

- Stable (default):

```bash
ottoctl update
```

- Nightly:

```bash
ottoctl update --nightly
```

- PR artifact:

```bash
ottoctl update --pr <number>
```

## Optional Repository Override

```bash
ottoctl update --repo <owner>/<repo>
```

## Post-Update Verification

```bash
ottoctl doctor
ottoctl task list
ottoctl model list
ottoctl extension list
```

## Operational Notes

- Update flow runs setup and service restart as part of command execution.
- If interactive prompts appear (for credentials/provisioning), complete or skip
  intentionally based on your deployment policy.

## Failure Handling

- If artifact download fails, rerun update after connectivity/repo checks.
- If post-update health is non-green, use [Incident Triage](./incident-triage.md).
