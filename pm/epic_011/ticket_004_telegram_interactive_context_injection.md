# Ticket 004 - Telegram Interactive Context Injection

## Status

- `state`: `planned`

## Objective

Inject compact recent non-interactive context into Telegram interactive prompts so follow-ups remain consistent with what Otto already attempted/sent.

## Scope

- Build formatter for compact context block with status labels.
- Inject recent context (default 20 events) into Telegram interactive prompt path.
- Keep current timeout/error and typing behavior intact.
- Log injection metadata (event count, truncation).

## Non-Goals

- No background execution prompt injection.
- No web parity in this ticket.

## Dependencies

- `ticket_001_context_event_persistence_and_repository.md`
- `ticket_003_delivery_status_mirroring_and_pruning.md`

## Planned File Changes

- `packages/otto/src/telegram-worker/inbound.ts` - inject formatted context before user message prompt.
- `packages/otto/src/telegram-worker/worker.ts` - wire repository dependency into inbound bridge creation.
- `packages/otto/src/runtime/serve.ts` - pass context query dependencies into telegram worker startup.
- `packages/otto/src/persistence/repositories.ts` - read helpers for latest events by `sourceSessionId`.
- `packages/otto/tests/telegram-worker/inbound.test.ts` - assert injected context block and no-leak behavior.
- `packages/otto/tests/telegram-worker/worker.test.ts` - integration coverage for wired dependencies.

## Acceptance Criteria

- Telegram interactive turns include compact context when events exist.
- Injection is session-scoped and never leaks between sessions.
- Empty-context path behaves exactly like current behavior.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/telegram-worker/inbound.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/telegram-worker/worker.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable Telegram-only user-visible increment.
