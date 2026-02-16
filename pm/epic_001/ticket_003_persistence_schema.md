# Ticket 003 - Persistent State Schema and Repositories

## Objective

Introduce SQLite-backed persistence for communication state, scheduling state, approvals, and idempotency.

## Why

Proactive systems require durable memory of what was sent, what is pending, and what already ran to avoid duplicate or lost actions.

## Scope

- Add SQLite database module under `~/.otto/data/`.
- Create schema migrations for:
  - `messages_in`
  - `messages_out`
  - `jobs`
  - `approvals`
  - `task_observations`
  - `user_profile`
- Implement repository layer with typed DTOs.
- Add migration/version tracking table.

## Non-Goals

- No business logic execution yet.
- No Google API integration yet.

## Dependencies

- `ticket_001`.

## Acceptance Criteria

- Database initializes automatically.
- Migrations are idempotent and versioned.
- Repositories support insert/update/query operations required by following tickets.

## Verification

- Migration tests.
- Repository unit tests with in-memory/temp DB.

## Deployability

- Deployable as backward-compatible infra foundation.
