# Ticket 004 - All-Lane Active-Provider Resolution Integration

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Route interactive, scheduled, and watchdog execution through one active-provider resolver so the same failover decision applies consistently everywhere.

## Scope

- Integrate active-provider resolver into interactive lane prompt path.
- Integrate resolver into scheduled task execution path.
- Integrate resolver into watchdog/failure-notification lane.
- Preserve existing explicit override semantics where already supported.
- Add lane-level tests that assert consistent model selection source.

## Non-Goals

- No settings/dashboard UI changes.
- No new persistence schema.
- No additional provider-order editing surface.

## Dependencies

- `ticket_003_health_loop_and_hybrid_failover_state_machine.md`

## Planned File Changes

- `packages/otto/src/model-management/resolver.ts` - active provider integration.
- `packages/otto/src/scheduler/executor.ts` - scheduled/watchdog selection path updates.
- `packages/otto/src/telegram-worker/opencode.ts` and interactive runtime call sites.
- `packages/otto/tests/scheduler/*.test.ts` - lane parity assertions.
- `packages/otto/tests/external-api/server.test.ts` or interactive lane tests as needed.
- `packages/otto-docs/docs/operator-guide/*.md` - lane parity behavior docs.

## Acceptance Criteria

- All lanes resolve runtime model via active provider state by default.
- Lane behavior is consistent after a failover event.
- Existing explicit per-run/per-job overrides still function where supported.
- Tests cover at least one failover scenario per lane class.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/*.test.ts`
- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable lane parity slice that makes reliability behavior effective across runtime surfaces.
