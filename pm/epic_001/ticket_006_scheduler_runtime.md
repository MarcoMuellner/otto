# Ticket 006 - Scheduler Runtime (One-Shot + Heartbeat Framework)

## Objective

Build scheduler infrastructure for recurring jobs: one-shot tick every 1-2 minutes and heartbeat windows (morning/midday/evening).

## Why

Proactivity depends on predictable recurring execution with durable run tracking.

## Scope

- Add scheduler loop with persisted `jobs` state.
- Implement two job types:
  - `oneshot_tick`
  - `heartbeat_window`
- Enforce timezone-aware scheduling from user profile/config.
- Add jitter/locking to avoid duplicate runs after restart.
- Trigger one-shot and heartbeat executions against the same OpenCode session used by inbound DM (single-chain continuity).
- Add per-chat/session serialization so scheduler turns do not race with inbound turns.

## Non-Goals

- No final business action logic yet.

## Dependencies

- `ticket_003`, `ticket_005`.

## Acceptance Criteria

- Jobs execute on expected cadence.
- Last run / next run persisted and restart-safe.
- Duplicate execution avoided.
- Scheduled runs preserve single-session conversational continuity without interleaving races.

## Verification

- Time-based unit tests with fake clocks.
- Integration test over restart cycle.

## Deployability

- Deployable as scheduling substrate with no risky write actions.
