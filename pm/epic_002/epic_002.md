# Epic 002 - Scheduler and Task Orchestration Engine

## Status

- `id`: `epic_002`
- `type`: epic ticket
- `state`: `planned`
- `goal`: deliver a deterministic one-minute scheduler with durable task definitions, task run history, and policy-safe task management.

## Why

We need proactive behavior without blind token burn. The runtime should wake every minute, run only due tasks, and keep full execution history. Task creation should stay natural, while execution policy stays deterministic.

## Decisions Locked In

- Scheduler loop runs every minute as orchestration heartbeat.
- Task cadence and state are persisted in SQLite.
- Scheduler executes only due tasks (`next_run_at <= now`) and computes next run deterministically.
- Task behavior defaults come from user-configurable JSON/JSONC task profile files in config space, not dist.
- AI can create/update/delete tasks, but only in interactive contexts (Telegram inbound or direct interactive OpenCode).
- Scheduled one-shot runs are not allowed to create/delete task definitions.

## Success Criteria

- One-minute tick loop is restart-safe and duplicate-run safe.
- Task lifecycle (create/update/delete/pause/resume) is auditable and policy-enforced.
- Every execution writes a structured run record with status and errors.
- Failure watchdog can alert via Telegram when runs fail.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Minute scheduler kernel and claim/lock semantics.
2. `ticket_002`: Task model, recurrence engine, and task run history.
3. `ticket_003`: Configurable task profiles and `ottoctl` profile operations.
4. `ticket_004`: Task management tools with interactive-vs-scheduled permission lanes.
5. `ticket_005`: Task execution engine and failure watchdog notifications.

## Out of Scope for Epic 002

- Rich approval-governed business actions.
- Full proactive recommendation intelligence.
- Heartbeat content generation.
