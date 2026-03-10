# Ticket 007 - Telegram EOD Transparency Digest

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Send a concise nightly Telegram digest summarizing EOD learning outcomes so operator transparency stays high while autonomous evolution runs.

## Scope

- Build digest formatter with key run outcomes (applied, skipped, candidates, follow-ups).
- Queue digest through outbound Telegram queue with existing notification policy behavior.
- Link digest to EOD run id for traceability.
- Add tests for success, partial-failure, and empty-learning windows.

## Non-Goals

- No control-plane UI reporting.
- No full evidence dump in Telegram.

## Dependencies

- `ticket_005` (EOD run outcomes available).
- `ticket_006` (follow-up scheduling counts reflected in digest).

## Planned File Changes

- `packages/otto/src/scheduler/eod-learning/digest.ts` - digest builder.
- `packages/otto/src/scheduler/executor.ts` - enqueue digest at EOD completion.
- `packages/otto/tests/scheduler/eod-learning-digest.test.ts` - digest formatting coverage.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- Successful EOD run emits one Telegram digest message per run.
- Digest includes run id, counts, and top learning highlights without sensitive raw payloads.
- Queue suppression/hold paths are handled through existing delivery policy.
- Failures to send digest do not erase persisted EOD artifacts.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/eod-learning-digest.test.ts`
- `pnpm -C packages/otto exec vitest run tests/telegram-worker/outbound-queue.test.ts -t "digest"`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable transparency increment; operator gains immediate nightly visibility into autonomous learning behavior.
