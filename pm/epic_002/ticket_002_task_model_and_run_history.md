# Ticket 002 - Task Model, Recurrence Engine, and Run History

## Objective

Define durable task records and immutable run history, then implement recurrence updates after each run.

## Why

A simple done flag is not enough for recurring tasks. We need task state and per-run audit records.

## Scope

- Add/extend task table fields for cadence and schedule state.
- Add task run history table with structured result and error fields.
- Implement recurrence calculation (`last_run_at`, `next_run_at`) per task.
- Persist run status (`success`, `failed`, `skipped`) and error details.

## Non-Goals

- Profile file loading.
- OpenCode execution policy.

## Dependencies

- `ticket_001`

## Acceptance Criteria

- Recurring tasks advance schedule deterministically.
- Every execution attempt creates a run history record.
- Failed runs store machine-readable error metadata.

## Verification

- Unit tests for recurrence math and run persistence.
- Migration tests for new schema.

## Deployability

- Deployable with full observability and no outbound behavior changes.
