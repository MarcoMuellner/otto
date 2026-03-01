# Ticket 005 - Web Interactive Context Injection Parity

## Status

- `state`: `planned`

## Objective

Provide the same interactive context injection behavior in Control Plane web chat as Telegram.

## Scope

- Add state DB read helper for recent context events by session/thread id.
- Inject context into web chat send path (`sendMessage` and `sendMessageStream`).
- Add audit metadata for injection count/status.
- Preserve degraded mode behavior if state DB is unavailable.

## Non-Goals

- TUI parity.
- New web screens.

## Dependencies

- `ticket_001_context_event_persistence_and_repository.md`
- `ticket_003_delivery_status_mirroring_and_pruning.md`

## Planned File Changes

- `packages/otto-control-plane/app/server/otto-state.server.ts` - add query for recent context events.
- `packages/otto-control-plane/app/server/chat-surface.server.ts` - inject compact context for sync and streaming prompt calls.
- `packages/otto-control-plane/tests/server/chat-surface.server.test.ts` - cover injected/non-injected/degraded behavior.
- `packages/otto-control-plane/tests/server/otto-state.server.test.ts` - cover context query mapping and ordering.

## Acceptance Criteria

- Web interactive follow-ups include recent non-interactive context for same session.
- Session isolation and fallback behavior match Telegram semantics.
- Existing streaming UX remains unchanged except added context in model input.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto-control-plane exec vitest run tests/server/chat-surface.server.test.ts`
  - `pnpm -C packages/otto-control-plane exec vitest run tests/server/otto-state.server.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto-control-plane run check`

## Deployability

- Deployable web parity increment with no additional infrastructure.
