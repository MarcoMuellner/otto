# Ticket 001 - Minute Scheduler Kernel and Claim/Lock Semantics

## Objective

Implement the one-minute scheduler runtime that scans due tasks and claims execution safely.

## Why

The scheduler must be deterministic and restart-safe before higher-level task behavior is added.

## Scope

- Add minute tick loop in runtime.
- Claim due tasks atomically using lock token + lock expiry.
- Prevent duplicate runs after restart or overlap.
- Add bounded batch processing per tick.

## Non-Goals

- Task business logic execution.
- Task CRUD and profile management.

## Dependencies

- `pm/epic_001/ticket_003`

## Acceptance Criteria

- Tick executes every 60s.
- Due-task claim is idempotent and duplicate-safe.
- Lock expiry recovers orphaned claims.

## Verification

- Fake-clock scheduler tests.
- Restart and overlap integration test.

## Deployability

- Deployable scheduling substrate with no external side effects.
