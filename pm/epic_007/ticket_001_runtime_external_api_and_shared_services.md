# Ticket 001 - Runtime External API and Shared Services

## Status

- `state`: `planned`

## Objective

Create an authenticated runtime-owned external API surface and extract shared application services so internal and external APIs reuse the same business logic.

## Why

The control plane must consume stable runtime contracts without duplicating behavior or bypassing source-of-truth logic.

## Scope

- Add external API module in `packages/otto/src` with dedicated route registration.
- Add external API auth middleware requiring bearer token on every endpoint.
- Extract shared services for jobs/system/settings actions currently embedded in route handlers.
- Wire existing internal API routes to shared services.
- Add initial external endpoints for health and jobs read operations.
- Add request/response schema validation with Zod.

## Interfaces and Contracts

- External endpoints:
  - `GET /external/health`
  - `GET /external/jobs?lane=scheduled`
  - `GET /external/jobs/:id`
- Auth:
  - `Authorization: Bearer <otto-token>` required for all `/external/*` routes.
- Service layer:
  - shared use by both internal and external API adapters.

## Non-Goals

- UI process or frontend work.
- Jobs mutation endpoints.
- New scheduler capability behavior.

## Dependencies

- None.

## Engineering Principles Applied

- **TDD**: write endpoint and service tests first (auth, schema, parity with existing behavior).
- **DRY**: no duplicate business logic between APIs.
- **SOLID**: separate API adapter from application service and repository layers.
- **KISS**: add only contracts needed by downstream tickets.

## Acceptance Criteria

- External API routes exist and are LAN-bind-capable under runtime process.
- Every external route returns `401` without valid token.
- Internal API and external API both call shared services for overlapping behavior.
- Jobs read endpoints return scheduled lane data with stable response shapes.
- Minimal docs added describing internal vs external API boundaries.

## Verification

- New tests for auth, response contracts, and shared service behavior.
- Regression tests for existing internal API continue to pass.
- `pnpm -C packages/otto run typecheck`
- `pnpm -C packages/otto run test`

## Deployability

- Deployable backend slice with no operator-visible UI yet.
