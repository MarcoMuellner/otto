# Ticket 001 - Telegram Worker Foundation

## Objective

Create a dedicated Telegram worker runtime with clear process boundaries and lifecycle hooks, without yet implementing full bot behavior.

## Why

Proactive communication should not be tightly coupled to core runtime bootstrap. A dedicated worker keeps comms logic isolated, testable, and operationally safer.

## Scope

- Add `src/telegram-worker/` module boundary.
- Add typed worker config loader (env + Otto config integration).
- Add worker start/stop lifecycle with graceful SIGINT/SIGTERM handling.
- Add health log events and worker boot diagnostics.

## Non-Goals

- No Telegram message handling logic yet.
- No scheduling logic yet.

## Dependencies

- None.

## Acceptance Criteria

- Worker can start and stop cleanly.
- Worker lifecycle is independently testable.
- Runtime logs identify worker boot/shutdown transitions.

## Verification

- Unit tests for config parsing and lifecycle.
- Local run confirms graceful shutdown behavior.

## Deployability

- Safe to deploy; no user-facing behavior changes.
