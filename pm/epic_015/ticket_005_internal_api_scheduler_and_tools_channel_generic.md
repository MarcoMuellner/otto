# Ticket 005 - Internal API, Scheduler, and Tools Channel-Generic Migration

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Migrate internal APIs, scheduler flows, watchdog/heartbeat notifications, and OpenCode tools to channel-generic contracts with Telegram compatibility aliases.

## Scope

- Add generic internal endpoints for queue message/file operations.
- Replace direct Telegram enqueue usage in scheduler/watchdog/heartbeat paths.
- Update OpenCode tool contracts to target generic endpoints.
- Keep `/internal/tools/queue-telegram-*` as compatibility aliases.

## Non-Goals

- No removal of Telegram alias endpoints.
- No Slack adapter runtime in this ticket.
- No control-plane feature redesign.

## Dependencies

- `pm/epic_015/ticket_003_unified_outbound_queue_and_dispatcher.md`
- `pm/epic_015/ticket_004_unified_inbound_pipeline_and_session_binding.md`

## Planned File Changes

- `packages/otto/src/internal-api/server.ts` - add channel-generic endpoints and alias routing.
- `packages/otto/src/scheduler/executor.ts` - remove Telegram-specific outbound coupling.
- `packages/otto/src/scheduler/heartbeat.ts` - route through generic channel service.
- `packages/otto/src/scheduler/watchdog.ts` - route through generic channel service.
- `packages/otto/src/assets/.opencode/tools/queue_telegram_message.ts` - compatibility wrapper updates.
- `packages/otto/src/assets/.opencode/tools/queue_telegram_file.ts` - compatibility wrapper updates.
- `packages/otto/src/assets/.opencode/tools/queue_message.ts` - new generic tool.
- `packages/otto/src/assets/.opencode/tools/queue_file.ts` - new generic tool.

## Acceptance Criteria

- Scheduler and internal API no longer require Telegram-specific enqueue contracts.
- Generic queue endpoints support channel + target payloads.
- Telegram tool aliases continue to work unchanged for existing automations.
- Command audit trails include resolved channel metadata.

## Verification

- `pnpm -C packages/otto exec vitest run tests/internal-api/server.test.ts`
- `pnpm -C packages/otto exec vitest run tests/scheduler/executor.test.ts`
- `pnpm -C packages/otto exec vitest run tests/scheduler/watchdog.test.ts`
- `pnpm -C packages/otto run docs:openapi:check`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable API/orchestration slice with backward-compatible Telegram aliases.
