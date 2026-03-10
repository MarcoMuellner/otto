# Ticket 002 - System Nightly EOD Task Bootstrap

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Ensure Otto always has a dedicated `system-daily-eod-learning` recurring task that executes at user-local midnight.

## Scope

- Add task constants and bootstrap helper for EOD system task creation.
- Wire bootstrap into runtime startup flow (alongside watchdog ensure behavior).
- Compute next-run timestamps at timezone midnight with DST-safe semantics.
- Add scheduler/startup tests for idempotent ensure behavior.

## Non-Goals

- No EOD evidence aggregation or apply pipeline.
- No Telegram digest formatting.
- No task-type-specific post-run re-alignment to timezone midnight; recurring cadence remains fixed at 24h after bootstrap.

## Dependencies

- `ticket_001` (schema/repository primitives available for upcoming handlers).

## Planned File Changes

- `packages/otto/src/scheduler/eod-learning.ts` - constants and ensure helper.
- `packages/otto/src/runtime/serve.ts` - call ensure helper at startup.
- `packages/otto/tests/scheduler/eod-learning.test.ts` - ensure/idempotency tests.
- `packages/otto/tests/runtime/serve.test.ts` - startup wiring coverage.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- `system-daily-eod-learning` is created once and reused across restarts.
- Task schedule resolves to user timezone midnight.
- Startup logs include created/existing status and timezone context.
- Existing watchdog/system bootstrap behavior remains unaffected.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/eod-learning.test.ts`
- `pnpm -C packages/otto exec vitest run tests/runtime/serve.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable system-task bootstrap slice; task exists but can remain behavior-minimal until handler tickets land.
- Follow-up needed for per-run timezone-midnight re-alignment to eliminate drift after late runs and DST boundaries.
