# Ticket 004 - 24h Evidence Aggregation Service

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Build a deterministic service that aggregates all relevant signals from the last 24h across lanes into a normalized evidence bundle for EOD decisioning.

## Scope

- Read and normalize evidence from task audit, command audit, job runs, and interactive-context streams.
- Include traceable source references per evidence item.
- Add de-duplication and signal grouping primitives for independent-signal counting.
- Add zod schema for model-input payload shape.
- Add service-level tests for mixed-lane scenarios.

## Non-Goals

- No decision thresholding or auto-apply logic.
- No Telegram digest formatting.

## Dependencies

- `ticket_001` (EOD persistence targets available).

## Planned File Changes

- `packages/otto/src/scheduler/eod-learning/evidence-aggregation.ts` - aggregation service.
- `packages/otto/src/scheduler/eod-learning/schemas.ts` - evidence payload schemas.
- `packages/otto/tests/scheduler/eod-learning-evidence.test.ts` - aggregation coverage.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- Service returns a stable evidence bundle for any 24h window.
- Evidence entries include source identifiers sufficient for audit traceability.
- Independent signal grouping is deterministic and test-covered.
- Aggregation handles empty/noisy windows without throwing.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/eod-learning-evidence.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable backend service slice with no user-visible behavior change yet.
