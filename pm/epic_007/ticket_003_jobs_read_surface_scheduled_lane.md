# Ticket 003 - Jobs Read Surface (Scheduled Lane)

## Status

- `state`: `planned`

## Objective

Ship a Jobs page for scheduled/background work with clear separation between read-only system-managed jobs and operator-managed jobs.

## Why

Operational completeness starts with visibility into what Otto is running, what failed, and what can be acted on.

## Scope

- Add external API read contracts for scheduled jobs, details, and recent audit context.
- Expose mutability metadata in external API DTOs for UI enforcement.
- Implement Jobs list and Job detail views in control plane.
- Implement required view states: loading, empty, success, and error.
- Add command palette navigation entry to Jobs surface.

## Interfaces and Contracts

- Runtime external endpoints:
  - `GET /external/jobs?lane=scheduled`
  - `GET /external/jobs/:id`
  - `GET /external/jobs/:id/audit` (or equivalent detail expansion contract)
- Control-plane endpoints:
  - `GET /api/jobs`
  - `GET /api/jobs/:id`

## Non-Goals

- Create/edit/cancel/run-now actions.
- Interactive lane support.

## Dependencies

- `ticket_001`
- `ticket_002`

## Engineering Principles Applied

- **TDD**: start with contract tests for list/detail DTOs and state rendering tests.
- **DRY**: one shared mapping layer from runtime DTOs to UI view models.
- **SOLID**: isolate data-fetch loaders from visual components.
- **KISS**: paginate or cap data simply; avoid speculative filtering complexity.

## Acceptance Criteria

- Jobs page loads scheduled jobs through BFF and renders both sections:
  - system-managed (read-only)
  - operator-managed
- Job detail shows schedule, lifecycle state, timing fields, and recent audit evidence.
- UI behavior handles loading, empty, and error states without dead ends.
- Docs updated with Jobs read contract and section semantics.

## Verification

- API contract tests for jobs list/detail.
- Component/integration tests for grouped rendering and view states.
- Manual smoke: open Jobs, inspect at least one system job and one operator job.
- `pnpm run check`

## Deployability

- Deployable read-only Jobs slice delivering immediate observability value.
