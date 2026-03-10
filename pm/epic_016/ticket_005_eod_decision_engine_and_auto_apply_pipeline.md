# Ticket 005 - EOD Decision Engine and Auto-Apply Pipeline

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Implement the nightly EOD executor that converts evidence into structured learning decisions and auto-applies memory+journal updates according to confidence and contradiction policy.

## Scope

- Add EOD task execution handler to scheduler executor routing.
- Build scheduled prompt contract for structured learning candidate output.
- Enforce policies:
  - at least two independent signals,
  - contradiction => skip,
  - confidence thresholds (`>=0.8`, `0.6-0.79`, `<0.6`).
- Execute memory+journal apply operations for qualified candidates.
- Persist run/item/evidence/action outcomes in EOD tables.

## Non-Goals

- No follow-up task scheduling (handled in next ticket).
- No Telegram summary send.

## Dependencies

- `ticket_003` (profile and tool contract).
- `ticket_004` (evidence aggregation input).

## Planned File Changes

- `packages/otto/src/scheduler/executor.ts` - task-type wiring and execution flow.
- `packages/otto/src/scheduler/eod-learning/decision-engine.ts` - policy and decision evaluator.
- `packages/otto/src/scheduler/eod-learning/prompt.ts` - model prompt + response schema contract.
- `packages/otto/tests/scheduler/executor.test.ts` - EOD execution path coverage.
- `packages/otto/tests/scheduler/eod-learning-decision.test.ts` - threshold/conflict behavior tests.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- EOD handler runs successfully via scheduled lane and writes full run artifacts.
- Contradictory candidates are persisted as skipped and never auto-applied.
- Confidence-band behavior is deterministic and test-verified.
- Memory/journal apply failures are captured per-item without dropping full run history.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/eod-learning-decision.test.ts`
- `pnpm -C packages/otto exec vitest run tests/scheduler/executor.test.ts -t "eod"`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable EOD core behavior slice; nightly run can already learn/apply/persist before follow-up scheduling and digest enhancements.
