---
id: daily-self-learning-eod
title: Daily Self-Learning (EOD)
description: Understand, trigger, and verify Otto's nightly end-of-day learning cycle.
---

## Scope

Otto runs a dedicated nightly self-learning task that reviews the previous 24h of
activity, applies qualified memory and journal updates, and sends a transparency
digest.

System task id: `system-daily-eod-learning`

## What Runs Each Night

- Scheduler target is local midnight in the configured timezone.
- Runtime aggregates evidence from sessions and task runs in the previous 24h.
- Each learning item is evaluated with confidence + contradiction policy.
- Qualified items are auto-applied to memory/journal.
- High-confidence reversible improvements can queue follow-up tasks.
- A Telegram transparency digest is queued after the run completes.

## Decision Policy

- Evidence gate for auto-apply: at least two independent signals and no
  contradiction.
- Confidence `>= 0.8`: apply memory/journal and allow reversible follow-up
  scheduling.
- Confidence `0.6 - 0.79`: apply memory/journal only.
- Confidence `< 0.6`: persist as candidate without auto-apply.
- Conflicting signals are persisted for audit and never auto-applied.

## Manual Trigger (CLI)

Use this when you want to force an immediate learning run instead of waiting for
midnight.

```bash
ottoctl task run-now system-daily-eod-learning
```

Useful companion checks:

```bash
ottoctl task show system-daily-eod-learning
ottoctl task audit 50
```

## Audit and Visibility

- Run artifacts are persisted in SQLite (`eod_learning_runs`, items, evidence,
  actions).
- `ottoctl task audit` shows command/task audit trail for trigger and execution.
- Internal EOD history tooling is available to assistant lanes for detailed run
  inspection (`list_eod_learning`, `show_eod_learning_run`).

## Operational Notes

- If the system task is paused, `task run-now` fails until resumed.
- If Telegram policy blocks outbound delivery, digest send can be skipped while
  run artifacts remain persisted.
- Treat this as an autonomous system workflow: verify via audit/history rather
  than ad-hoc state edits.
