# Ticket 004 - Unified Inbound Pipeline and Session Binding

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Create one channel-generic inbound pipeline that normalizes provider events, applies dedupe and binding resolution, and feeds existing interactive processing paths.

## Scope

- Define canonical inbound event mapping and processing service.
- Move session binding resolution to channel-neutral binding keys.
- Preserve current interactive prompt timeout/fallback behavior.
- Keep context injection behavior intact while decoupling provider-specific assumptions.

## Non-Goals

- No Slack event transport wiring yet.
- No scheduler/internal API migration yet.
- No behavior changes to core OpenCode prompt orchestration.

## Dependencies

- `pm/epic_015/ticket_001_canonical_channel_contract_and_registry.md`
- `pm/epic_015/ticket_002_channel_neutral_persistence_and_binding_migrations.md`
- `pm/epic_015/ticket_003_unified_outbound_queue_and_dispatcher.md`

## Planned File Changes

- `packages/otto/src/channels/inbound-service.ts` - canonical inbound processing.
- `packages/otto/src/channels/session-binding.ts` - channel-neutral binding resolver.
- `packages/otto/src/telegram-worker/inbound.ts` - adapter mapping to canonical inbound service.
- `packages/otto/tests/channels/inbound-service.test.ts` - inbound dedupe/session tests.
- `packages/otto/tests/telegram-worker/inbound.test.ts` - parity regression tests.

## Acceptance Criteria

- Inbound processing no longer depends on Telegram-specific binding key shape.
- Duplicate inbound handling remains idempotent.
- Assistant replies still enqueue/send through unified outbound flow.
- Telegram inbound behavior is preserved.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/inbound-service.test.ts`
- `pnpm -C packages/otto exec vitest run tests/telegram-worker/inbound.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable inbound core slice with Telegram adapter compatibility.
