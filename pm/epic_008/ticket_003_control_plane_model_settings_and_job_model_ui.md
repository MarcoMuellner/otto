# Ticket 003 - Control-Plane Model Settings and Job Model UI

## Status

- `state`: `planned`

## Objective

Add web control-plane support for global flow defaults, catalog refresh, and per-job model override in job forms.

## Why

Model management should be available in the same web control-plane workflows used for job operations, not only via CLI.

## Scope

- Add BFF routes in `packages/otto-control-plane`:
  - `GET /api/models/catalog`
  - `POST /api/models/refresh`
  - `GET /api/models/defaults`
  - `PUT /api/models/defaults`
- Add global model settings UI surface for:
  - viewing catalog + freshness
  - refreshing catalog manually
  - editing four flow defaults
- Update jobs create/edit forms with model selector:
  - `inherit scheduled default`
  - explicit model from catalog
- Update control-plane contracts/types to include nullable `modelRef`.
- Preserve command-palette and route integration conventions already used in control-plane.

## Interfaces and Contracts

- BFF contracts mirror runtime external model endpoints.
- UI submits `modelRef: null` for inherit and `modelRef: "provider/model"` for explicit.
- Jobs read payload includes `modelRef` and shows effective behavior clearly in form/detail UI.

## Non-Goals

- Non-runtime model domains (voice/transcription).
- Advanced model analytics or usage dashboards.

## Dependencies

- `ticket_002`

## Engineering Principles Applied

- **TDD**: BFF route tests and UI interaction tests first.
- **DRY**: shared contracts for route validation and type inference.
- **SOLID**: keep BFF endpoint handlers separate from React view logic.
- **KISS**: simple selectors and explicit save/refresh actions.

## Acceptance Criteria

- Operator can refresh catalog and edit flow defaults from web UI.
- Operator can set job model to inherit or explicit model in create/edit forms.
- UI uses BFF only; no browser call to runtime external API.
- Validation and upstream failures are shown with clear operator feedback.

## Verification

- BFF tests for model endpoints and error mapping.
- UI tests for defaults form, refresh action, and job model selector behavior.
- Manual smoke:
  - update one flow default in web UI
  - set one job model explicit, one inherit
  - verify persisted values via page reload
- `pnpm -C packages/otto-control-plane run check`

## Deployability

- Deployable web parity increment that exposes model management in existing jobs/settings workflows.
