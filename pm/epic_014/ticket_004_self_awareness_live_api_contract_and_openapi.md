# Ticket 004 - Live Self-Awareness API Contract and OpenAPI Publication

## Status

- `state`: `done`
- `category`: `feature`
- `implementation`: `done`

## Objective

Expose a stable, token-authenticated live self-awareness contract for runtime state, active processes, limits, recent decisions, and open risks, and document it in OpenAPI artifacts.

## Scope

- Define response schemas for live self-awareness snapshot endpoints.
- Implement endpoint(s) from runtime-owned API surface.
- Source recent decisions/risks from existing audit and runtime state (audit-first for v1).
- Update generated OpenAPI docs and related references.
- Add tests for auth, schema validity, and degraded-source behavior.

## Non-Goals

- No full historical replay/timeline UI.
- No new persistence model for decisions in v1.
- No docs UI integration in this ticket.

## Dependencies

- `pm/epic_014/ticket_003_docs_service_runtime_process_and_ottoctl_lifecycle.md`

## Planned File Changes

- `packages/otto/src/external-api/server.ts` - self-awareness endpoint contract and handlers.
- `packages/otto/src/runtime/serve.ts` - provider wiring as needed.
- `packages/otto/tests/external-api/server.test.ts` - contract/auth regression coverage.
- generated OpenAPI artifacts and docs references.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Authenticated clients receive validated self-awareness snapshot payload.
- Unauthenticated requests are rejected.
- Payload includes state/process/limits/recent decisions/open risks fields.
- OpenAPI artifacts reflect endpoint and schema changes.

## Verification

- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts`
- `pnpm -C packages/otto run check`
- `pnpm run check`

## Deployability

- Deployable API increment with stable contract and documentation updates.
