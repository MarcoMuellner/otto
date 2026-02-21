# Ticket 005 - System Status and Runtime Operations

## Status

- `state`: `planned`

## Objective

Provide system status visibility and core runtime operations in the control plane, while keeping runtime API ownership in Otto.

## Why

After jobs control, the operator needs service-level truth and safe operational actions without terminal usage.

## Scope

- Add runtime external status endpoints for service/runtime health matrix.
- Add controlled runtime operation endpoint(s), including restart.
- Implement System page in control plane with clear service and runtime metadata.
- Implement action confirmation UX and degraded-state messaging during restart windows.
- Ensure UI process remains available while runtime restarts.

## Interfaces and Contracts

- Runtime external endpoints:
  - `GET /external/system/status`
  - `POST /external/system/restart`
- Control-plane endpoints:
  - `GET /api/system/status`
  - `POST /api/system/restart`

## Non-Goals

- Deep analytics dashboards.
- Fleet management or multi-node orchestration.

## Dependencies

- `ticket_001`
- `ticket_002`

## Engineering Principles Applied

- **TDD**: operation endpoint and transient-failure UI tests first.
- **DRY**: shared operation execution path and status DTO mapping.
- **SOLID**: keep status collection, command execution, and UI rendering decoupled.
- **KISS**: expose only the minimum set of operations needed for MVP.

## Acceptance Criteria

- System page shows runtime status, service states, and core metadata.
- Restart action works through control plane and is audited.
- During restart, UI displays actionable degraded state and recovers automatically.
- Docs updated with restart behavior and operational caveats.

## Verification

- Endpoint tests for status and restart contracts.
- UI tests for degraded/recovered state transitions.
- Manual smoke: trigger runtime restart and confirm UI remains reachable.
- `pnpm run check`

## Deployability

- Deployable system-ops slice meeting MVP priority #2 (part 1).
