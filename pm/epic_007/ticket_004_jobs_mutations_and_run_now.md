# Ticket 004 - Jobs Mutations and Run-Now

## Status

- `state`: `planned`

## Objective

Enable full operator control for scheduled jobs: create, edit, cancel, and run-now, while preserving read-only protection for system-managed jobs.

## Why

Operational completeness requires direct action from UI, not only visibility.

## Scope

- Add external API mutation endpoints for scheduled jobs.
- Add run-now action semantics for immediate execution eligibility.
- Enforce server-side mutation denial for system-managed jobs.
- Implement Jobs action UI (forms, confirmations, success/error feedback).
- Record and expose mutation audit context for post-action confidence.

## Interfaces and Contracts

- Runtime external endpoints:
  - `POST /external/jobs`
  - `PATCH /external/jobs/:id`
  - `DELETE /external/jobs/:id`
  - `POST /external/jobs/:id/run-now`
- Control-plane endpoints:
  - `POST /api/jobs`
  - `PATCH /api/jobs/:id`
  - `DELETE /api/jobs/:id`
  - `POST /api/jobs/:id/run-now`

## Non-Goals

- Interactive lane mutations.
- Workflow authoring or complex job templates.

## Dependencies

- `ticket_003`

## Engineering Principles Applied

- **TDD**: write failing tests for validation, forbidden mutations, and run-now behavior first.
- **DRY**: reuse shared job services and validation schemas.
- **SOLID**: mutation orchestration in services, transport concerns in route adapters.
- **KISS**: explicit, minimal fields for create/edit; no dynamic form system.

## Acceptance Criteria

- Operator can create, edit, cancel, and run-now eligible scheduled jobs from UI.
- System-managed jobs reject mutation attempts with clear error contract.
- Mutation outcomes are audited and visible in Jobs detail context.
- UI handles optimistic and failure states predictably.
- Docs updated with mutation contract and operator guardrails.

## Verification

- Integration tests for all mutation endpoints and forbidden paths.
- UI interaction tests for modal/forms and response handling.
- Manual smoke: full lifecycle on operator-managed job including run-now.
- `pnpm run check`

## Deployability

- Deployable Jobs control slice meeting MVP priority #1.
