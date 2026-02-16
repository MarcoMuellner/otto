# Ticket 003 - Persistent State Schema and Repositories

## Objective

Introduce SQLite-backed persistence for orchestration state while reusing OpenCode sessions for conversation history.

## Why

Proactive systems require durable memory of what was sent, what is pending, and what already ran to avoid duplicate or lost actions. OpenCode sessions keep dialog context, but orchestration state still needs dedicated persistence.

## Scope

- Add SQLite database module under `~/.otto/data/`.
- Create schema migrations for:
  - `session_bindings` (Telegram chat and proactive worker session mappings to OpenCode session IDs)
  - `messages_in`
  - `messages_out`
  - `jobs`
  - `approvals`
  - `task_observations`
  - `user_profile`
- Implement repository layer with typed DTOs.
- Add migration/version tracking table.

## Non-Goals

- Replacing OpenCode as the source of truth for conversation history.
- No business logic execution yet.
- No Google API integration yet.

## Dependencies

- `ticket_001`.

## Acceptance Criteria

- Database initializes automatically.
- Migrations are idempotent and versioned.
- Session bindings allow reuse of OpenCode sessions for Telegram and proactive one-shot flows.
- Repositories support insert/update/query operations required by following tickets.

## Verification

- Migration tests.
- Repository unit tests with in-memory/temp DB.

## Deployability

- Deployable as backward-compatible infra foundation.
