---
id: setup-and-first-start
title: Setup and First Start
description: Baseline setup sequence for a new or refreshed Otto install.
---

## Preconditions

- Installed `ottoctl` binary
- Node runtime available in service environment

## Procedure

1. Configure Telegram credentials:

```bash
ottoctl configure-telegram
```

1. Configure voice transcription (optional but recommended):

```bash
ottoctl configure-voice-transcription
```

1. Start services:

```bash
ottoctl start
```

1. Run health checks:

```bash
ottoctl doctor
```

## Expected Signals

- Start command returns success
- Doctor returns green or actionable yellow/red hints
- Control-plane and docs endpoints are reachable

## Escalation

- If doctor is non-green, continue with [Incident Triage](./incident-triage.md).
