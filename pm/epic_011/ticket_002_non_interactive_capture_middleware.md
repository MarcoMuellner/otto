# Ticket 002 - Non-Interactive Capture Middleware

## Status

- `state`: `planned`

## Objective

Capture non-interactive outbound user-facing messages into the context stream at enqueue time, independent of later delivery success.

## Scope

- Add a reusable context capture service in runtime package.
- Wire capture at non-interactive outbound enqueue call sites where `sourceSessionId` can be resolved.
- Store message content, lane/source metadata, and enqueue status.
- Ensure capture path does not break existing outbound queue behavior on capture failure.

## Non-Goals

- No interactive prompt injection.
- No outbound delivery-status updates (covered in next ticket).

## Dependencies

- `ticket_001_context_event_persistence_and_repository.md`

## Planned File Changes

- `packages/otto/src/scheduler/executor.ts` - attach capture calls for background lifecycle enqueue path.
- `packages/otto/src/internal-api/server.ts` - capture milestone and non-interactive route enqueue events with session context.
- `packages/otto/src/scheduler/heartbeat.ts` - capture heartbeat enqueue events (when session context exists).
- `packages/otto/src/scheduler/watchdog.ts` - capture watchdog enqueue events (when session context exists).
- `packages/otto/src/runtime/serve.ts` - instantiate/wire context event repository and capture dependencies.
- `packages/otto/src/persistence/repositories.ts` - minor contract additions used by capture middleware.
- `packages/otto/tests/scheduler/executor.test.ts` - assert capture records for background lifecycle messages.
- `packages/otto/tests/internal-api/server.test.ts` - assert capture records for milestone/internal enqueue routes.

## Acceptance Criteria

- Eligible non-interactive outbound attempts create context events with `queued` state.
- Capture is keyed by `sourceSessionId`.
- Capture failures are logged and do not block enqueue.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/scheduler/executor.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/internal-api/server.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable runtime increment; existing outbound delivery behavior remains unchanged.
