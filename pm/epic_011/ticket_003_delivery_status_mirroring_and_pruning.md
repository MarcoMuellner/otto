# Ticket 003 - Delivery Status Mirroring and Pruning

## Status

- `state`: `planned`

## Objective

Mirror outbound queue delivery outcomes into the context stream and enforce per-session retention caps.

## Scope

- Update context events from outbound queue lifecycle transitions.
- Mirror status changes for sent/retry/failed outcomes.
- Apply per-session retention pruning with configurable cap (default 100).
- Add deterministic logging for mirrored transitions.

## Non-Goals

- No interactive prompt injection.
- No settings surface changes yet.

## Dependencies

- `ticket_001_context_event_persistence_and_repository.md`
- `ticket_002_non_interactive_capture_middleware.md`

## Planned File Changes

- `packages/otto/src/telegram-worker/outbound-queue.ts` - hook status updates and pruning into delivery pipeline.
- `packages/otto/src/persistence/repositories.ts` - add repository methods used by status mirror and prune.
- `packages/otto/tests/telegram-worker/outbound-queue.test.ts` - assert mirrored status transitions and prune behavior.
- `packages/otto/tests/persistence/repositories.test.ts` - extend coverage for status update and cap enforcement.

## Acceptance Criteria

- Context events reflect outbound status transitions in near-real-time.
- Failed attempts remain visible in context stream.
- Retention cap is enforced per session without affecting queue behavior.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/telegram-worker/outbound-queue.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/persistence/repositories.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable runtime increment with additive observability and bounded storage behavior.
