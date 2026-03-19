# Ticket 005 - Reliability Snapshot API and BFF Contracts

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Expose runtime reliability status and recent history through authenticated external API and control-plane BFF routes for System page consumption.

## Scope

- Add external API contract(s) for reliability snapshot and recent history.
- Add control-plane external API client methods for reliability payloads.
- Add `/api/...` route handlers in control-plane server for reliability reads.
- Add tests for success, degraded, and upstream error mapping.
- Regenerate and verify OpenAPI artifacts.

## Non-Goals

- No System page rendering changes.
- No Settings mutation UI.
- No cost/billing analytics endpoints.

## Dependencies

- `ticket_003_health_loop_and_hybrid_failover_state_machine.md`
- `ticket_004_all_lane_active_provider_resolution_integration.md`

## Planned File Changes

- `packages/otto/src/external-api/server.ts` - reliability endpoints and schemas.
- `packages/otto-control-plane/app/server/otto-external-api.server.ts` - client methods.
- `packages/otto-control-plane/app/server/api-*.server.ts` and `app/routes/api.*.ts` - BFF routes.
- `packages/otto/tests/external-api/server.test.ts` - endpoint tests.
- `packages/otto-control-plane/tests/server/otto-external-api.server.test.ts` - client tests.
- `packages/otto/docs/openapi/*` - regenerated API artifacts.
- `packages/otto-docs/docs/api-reference/*.md` - API docs update.

## Acceptance Criteria

- API returns active model, last switch metadata, failover counters, and recent check/switch entries.
- Control-plane BFF can fetch and validate payloads with zod schemas.
- Unauthorized and upstream failure responses are correctly mapped.
- OpenAPI artifacts include new reliability endpoints and pass docs check.

## Verification

- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts`
- `pnpm -C packages/otto-control-plane exec vitest run tests/server/otto-external-api.server.test.ts`
- `pnpm -C packages/otto run docs:openapi:check`
- `pnpm -C packages/otto run check && pnpm -C packages/otto-control-plane run check`

## Deployability

- Deployable read-only API slice that enables dashboard work without mutating runtime behavior.
