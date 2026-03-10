# Ticket 001 - EOD Learning Persistence Schema and Repositories

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Add durable SQLite persistence for nightly EOD learning runs so every decision and action is auditable and queryable by runtime services.

## Scope

- Add migration(s) for EOD run/item/evidence/action tables.
- Add repository contracts and implementations for writing and reading EOD artifacts.
- Add indexed query paths for recent runs and 24h-window references.
- Add persistence tests for CRUD and ordering semantics.

## Non-Goals

- No scheduler wiring or system task creation.
- No model decisioning logic.
- No Telegram digest behavior.

## Dependencies

- None.

## Planned File Changes

- `packages/otto/src/persistence/migrations.ts` - add EOD tables and indexes.
- `packages/otto/src/persistence/repositories.ts` - add EOD repository types and methods.
- `packages/otto/tests/persistence/repositories.test.ts` - EOD persistence coverage.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- New tables exist for runs, items, evidence, and actions with stable foreign-key relationships.
- Repository can persist one run with multiple items/evidence/actions atomically.
- Recent-run list and run-details queries are deterministic and tested.
- Schema supports confidence, contradiction flag, decision, expected value, and apply status fields.

## Verification

- `pnpm -C packages/otto exec vitest run tests/persistence/repositories.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable persistence slice with no runtime behavior change until later tickets consume the schema.
