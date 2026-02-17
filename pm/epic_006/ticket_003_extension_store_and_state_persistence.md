# Ticket 003 - Extension Store and Activation State Persistence

## Objective

Implement durable extension storage and activation state model in Otto runtime home.

## Why

Versioned installs and reliable rollback require persistent local state separate from active runtime wiring.

## Scope

- Add extension directories under `~/.otto/extensions`:
  - `store/<id>/<version>/...`
  - `state.json` (or equivalent durable state file)
- Implement repository/service helpers for:
  - recording installed versions
  - setting active version targets
  - listing installed/enabled extensions
  - safe remove checks (deny removing active version)
- Ensure setup/update creates extension root directories.

## Non-Goals

- CLI command UX.
- Runtime activation of tools/skills/MCP.

## Dependencies

- `ticket_002`.

## Acceptance Criteria

- State persists across service restarts.
- Multiple versions of same extension can coexist in store.
- Active/inactive version state is queryable and deterministic.

## Verification

- Unit tests for state transitions and persistence.
- Integration tests for install/remove state consistency.

## Deployability

- Deployable storage layer without changing active OpenCode behavior.
