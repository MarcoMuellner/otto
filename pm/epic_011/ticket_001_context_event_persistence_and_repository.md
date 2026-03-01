# Ticket 001 - Context Event Persistence and Repository

## Status

- `state`: `planned`

## Objective

Add durable SQLite persistence for interactive context events emitted by non-interactive lanes, with bounded retention support.

## Scope

- Add additive migration for `interactive_context_events` table.
- Add repository types and methods for:
  - insert event
  - list recent events by `sourceSessionId`
  - update delivery status by `outboundMessageId`
  - prune old rows by configurable cap
- Export new repository from persistence index.
- Add tests for migration and repository behavior.

## Non-Goals

- No capture/injection wiring yet.
- No settings API/UI changes yet.

## Dependencies

- None.

## Planned File Changes

- `packages/otto/src/persistence/migrations.ts` - add migration for context events table and indexes.
- `packages/otto/src/persistence/repositories.ts` - add context event record types and repository factory.
- `packages/otto/src/persistence/index.ts` - export new repository and types.
- `packages/otto/tests/persistence/migrations.test.ts` - assert new table exists.
- `packages/otto/tests/persistence/repositories.test.ts` - add CRUD/status/prune repository tests.

## Acceptance Criteria

- Runtime can persist and read context events by `sourceSessionId`.
- Delivery status can be updated deterministically from queue lifecycle.
- Pruning keeps only configured cap per session.
- Migration remains idempotent and backward-compatible.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/persistence/migrations.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/persistence/repositories.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable additive schema increment with no runtime behavior change by itself.
