---
id: incident-triage
title: Incident Triage
description: Fast triage flow for non-green health states and runtime drift.
---

Use this flow when health checks fail or operator-visible behavior drifts.

## Step 1: Collect Baseline

```bash
ottoctl doctor
ottoctl task audit 100
ottoctl heartbeat status
```

If needed, run deep checks:

```bash
ottoctl doctor --deep
```

## Step 2: Identify Blast Radius

Check whether drift is isolated to:

- Runtime process only
- Control-plane/docs service only
- External API auth/connectivity
- Scheduler/task/model surfaces

## Step 3: Stabilize

```bash
ottoctl restart
```

Then re-run:

```bash
ottoctl doctor
```

## Step 4: Deepen With Live Docs (Deployed Surface)

- Open live runtime view (`/live`)
- Inspect `state`, `processes`, `limits`, `sources`, and `openRisks`
- Map failing signals to troubleshooting pages in this section

## Step 5: Escalate or Close

- Close incident when doctor returns green and key operational commands succeed.
- Escalate when errors persist after restart and remediation hints are exhausted.
