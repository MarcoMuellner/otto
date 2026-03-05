# Ticket 003 - Unified Outbound Queue and Dispatcher

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Move outbound delivery to one channel-generic queue and dispatcher with uniform dedupe, priority, retries, and delivery status behavior.

## Scope

- Build channel-generic enqueue service and dispatcher pipeline.
- Preserve dedupe and priority semantics across channels.
- Persist lifecycle transitions and retry metadata through channel-neutral repositories.
- Keep Telegram sender behavior behind adapter boundary.

## Non-Goals

- No Slack adapter yet.
- No inbound flow migration yet.
- No removal of compatibility Telegram endpoints.

## Dependencies

- `pm/epic_015/ticket_001_canonical_channel_contract_and_registry.md`
- `pm/epic_015/ticket_002_channel_neutral_persistence_and_binding_migrations.md`

## Planned File Changes

- `packages/otto/src/channels/outbound-service.ts` - generic enqueue API.
- `packages/otto/src/channels/outbound-dispatcher.ts` - channel-generic dispatch runtime.
- `packages/otto/src/telegram-worker/outbound-enqueue.ts` - compatibility wrapper to new service.
- `packages/otto/src/telegram-worker/outbound-queue.ts` - integration with dispatcher boundary.
- `packages/otto/tests/channels/outbound-service.test.ts` - queue logic tests.
- `packages/otto/tests/channels/outbound-dispatcher.test.ts` - retry/status transition tests.

## Acceptance Criteria

- Outbound enqueue accepts channel-neutral target and payload contract.
- Retry and dedupe behavior match current Telegram expectations.
- Dispatcher transitions status correctly and records failure metadata.
- Telegram delivery path remains functional through adapter wrapper.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/outbound-service.test.ts`
- `pnpm -C packages/otto exec vitest run tests/channels/outbound-dispatcher.test.ts`
- `pnpm -C packages/otto exec vitest run tests/telegram-worker/outbound-enqueue.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable outbound core slice; Telegram remains operational via compatibility integration.
