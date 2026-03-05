---
id: service-lifecycle-and-health-checks
title: Service Lifecycle and Health Checks
description: Operate runtime, control-plane, and docs service lifecycle safely.
---

## Lifecycle Commands

```bash
ottoctl start
ottoctl restart
ottoctl stop
```

Lifecycle commands manage up to three services (artifact-dependent): runtime,
control-plane, and docs service.

## Standard Health Check Pass

```bash
ottoctl doctor
```

For deeper validation:

```bash
ottoctl doctor --deep
```

## Quick Runtime Checks

```bash
ottoctl task list
ottoctl model list
ottoctl extension list
ottoctl heartbeat status
```

## Expected Signals

- Services start/restart without system-level service errors
- Doctor verdict is green, or non-green includes clear remediation hints
- Task/model/extension commands return expected data structures

## If Signals Drift

- Run [Incident Triage](./incident-triage.md)
- Use focused troubleshooting pages in this section
