# Ticket 002 - Task Model, Schedule Engine, and Run History

## Objective

Define durable task records (recurring + one-shot) and immutable run history, then implement schedule updates after each run.

## Why

A simple done flag is not enough for recurring and one-shot tasks. We need explicit schedule semantics plus per-run audit records.

## Scope

- Add/extend task table fields for schedule type and state (`recurring`, `oneshot`).
- Add recurring schedule fields (cadence, `last_run_at`, `next_run_at`).
- Add one-shot schedule fields (`run_at`) and terminal task states.
- Add task run history table with structured result and error fields.
- Implement recurring schedule calculation (`last_run_at`, `next_run_at`) per task.
- Implement one-shot finalization rules (execute once, then complete/expire/cancel).
- Persist run status (`success`, `failed`, `skipped`) and error details.

## Non-Goals

- Profile file loading.
- OpenCode execution policy.

## Dependencies

- `ticket_001`

## Acceptance Criteria

- Recurring tasks advance schedule deterministically.
- One-shot tasks execute once and transition to a terminal state.
- Every execution attempt creates a run history record.
- Failed runs store machine-readable error metadata.

## Verification

- Unit tests for recurring and one-shot schedule transitions.
- Unit tests for run persistence and terminal-state handling.
- Migration tests for new schema.

## Deployability

- Deployable with full observability and no outbound behavior changes.
