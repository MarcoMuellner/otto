# Ticket 001 - LLM Provider Order and Reliability Persistence Schema

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Add durable SQLite persistence for global provider order, active-provider health state, health-check history, and switch events so reliability behavior is auditable and survives restarts.

## Scope

- Add migration(s) for provider-order singleton and reliability telemetry tables.
- Add repository contracts and implementations for read/write operations.
- Add deterministic query paths for recent checks and switch history.
- Add persistence tests for singleton semantics and event ordering.

## Non-Goals

- No lane routing behavior changes.
- No health-check scheduler logic.
- No UI changes.

## Dependencies

- None.

## Planned File Changes

- `packages/otto/src/persistence/migrations.ts` - add new reliability tables and indexes.
- `packages/otto/src/persistence/repositories.ts` - add repository APIs and implementations.
- `packages/otto/tests/persistence/repositories.test.ts` - add persistence coverage.
- `pm/epic_017/epic_017.md` - progress tracking.

## Acceptance Criteria

- Global order persists as exactly one active config row (`primary`, `secondary`).
- Active health state persists with fields needed by hybrid failover policy.
- Health checks and switch events are append-only, timestamped, and queryable.
- Repository tests cover create/update/read/history ordering with stable assertions.

## Verification

- `pnpm -C packages/otto exec vitest run tests/persistence/repositories.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable storage slice with no behavior change until runtime services consume new tables.
