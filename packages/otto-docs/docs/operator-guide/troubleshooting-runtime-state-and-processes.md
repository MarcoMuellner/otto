---
id: troubleshooting-runtime-state-and-processes
title: Troubleshooting Runtime State and Processes
description: Diagnose degraded runtime state and process status drift.
---

Use this page when live/runtime status indicates process degradation.

## Symptoms

- `ottoctl doctor` returns yellow/red
- Live snapshot `state.status` is `degraded`
- One or more `processes[].status` is `degraded`

## Checks

```bash
ottoctl doctor
ottoctl doctor --deep
ottoctl task list
ottoctl model list
ottoctl extension list
```

## Recovery Actions

1. Restart services:

```bash
ottoctl restart
```

1. Re-run doctor and command smoke checks.

1. If still degraded, inspect latest task/command audit entries:

```bash
ottoctl task audit 100
```

## Common Root Causes

- Service process not started or recycled incorrectly
- Local API auth/token drift affecting model/task surfaces
- Extension/runtime dependency drift surfaced by deep doctor checks

## Escalation

- Preserve doctor output and incident markdown artifact.
- Escalate with evidence codes from doctor checks.
