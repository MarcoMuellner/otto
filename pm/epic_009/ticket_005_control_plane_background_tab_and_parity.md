# Ticket 005 - Control Plane Background Tab and Parity

## Status

- `state`: `done`

## Objective

Expose interactive background one-shot tasks in Control Plane by reusing existing jobs UI and adding a dedicated background tab/filter.

## Scope

- Add Control Plane jobs tab/filter for background one-shot type.
- Reuse existing jobs list/detail rendering and cancel action.
- Ensure parity with Telegram/CLI operations (`list/show/cancel` semantics).
- Add docs/runbook notes for cross-surface background task workflow.

## Non-Goals

- New standalone dashboard.
- Web-based creation flow for background tasks.
- Multi-user access model.

## Dependencies

- `ticket_004_cross_surface_list_show_cancel.md`

## Acceptance Criteria

- Background tab/filter displays Telegram-originated background tasks.
- Detail view resolves and renders by canonical `job_id`.
- Cancel action from UI applies same runtime semantics as chat surfaces.
- UI and BFF tests validate filtering and operations parity.

## Verification

- Control Plane checks:
  - `pnpm -C packages/otto-control-plane run check`
- Runtime checks:
  - `pnpm -C packages/otto run check`
- Cross-package quality gate:
  - `pnpm run check`

## Deployability

- Deployable epic completion slice for operator-visible web parity.
