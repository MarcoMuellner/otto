# Ticket 002 - Channel-Neutral Persistence and Binding Migrations

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Introduce additive persistence changes so inbound/outbound records and session bindings become channel-neutral while preserving Telegram compatibility during migration.

## Scope

- Add migrations for channel-neutral binding and message metadata.
- Add repository methods for channel-aware binding lookup and delivery status transitions.
- Keep compatibility reads for existing Telegram binding keys and Telegram-specific legacy columns.
- Add migration and repository tests.

## Non-Goals

- No historical data backfill.
- No dropping of legacy Telegram columns in this ticket.
- No runtime dispatch changes.

## Dependencies

- `pm/epic_015/ticket_001_canonical_channel_contract_and_registry.md`

## Planned File Changes

- `packages/otto/src/persistence/migrations.ts` - additive schema migrations.
- `packages/otto/src/persistence/repositories.ts` - channel-neutral repository APIs.
- `packages/otto/tests/persistence/migrations.test.ts` - migration safety coverage.
- `packages/otto/tests/persistence/repositories.test.ts` - repository behavior coverage.
- `pm/epic_015/epic_015.md` - progress tracking.

## Acceptance Criteria

- Schema supports channel-neutral bindings and message metadata.
- Repositories support channel + conversation identifiers without Telegram regex coupling.
- Existing Telegram paths continue to resolve through compatibility behavior.
- Tests prove migration idempotence and backward-safe reads.

## Verification

- `pnpm -C packages/otto exec vitest run tests/persistence/migrations.test.ts`
- `pnpm -C packages/otto exec vitest run tests/persistence/repositories.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable additive migration slice with compatibility retention.
