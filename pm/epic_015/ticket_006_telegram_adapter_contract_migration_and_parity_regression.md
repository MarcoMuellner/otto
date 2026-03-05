# Ticket 006 - Telegram Adapter Contract Migration and Parity Regression

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Move Telegram fully behind the canonical channel contract and prove no functional regression across the baseline capability set.

## Scope

- Convert Telegram worker runtime into a contract-compliant adapter.
- Keep Telegram-specific provider details inside adapter implementation.
- Validate parity for text, media/file, voice/transcription, dedupe, priority, delivery states, and typing best effort.
- Add explicit regression suite for Telegram parity.

## Non-Goals

- No Slack implementation in this ticket.
- No user-visible behavior redesign for Telegram flows.

## Dependencies

- `pm/epic_015/ticket_004_unified_inbound_pipeline_and_session_binding.md`
- `pm/epic_015/ticket_005_internal_api_scheduler_and_tools_channel_generic.md`

## Planned File Changes

- `packages/otto/src/telegram-worker/worker.ts` - adapter boundary integration.
- `packages/otto/src/telegram-worker/security.ts` - adapter-level auth checks.
- `packages/otto/src/runtime/serve.ts` - load Telegram via channel registry.
- `packages/otto/src/runtime/telegram-worker.ts` - adapter runtime composition.
- `packages/otto/tests/telegram-worker/*.test.ts` - expanded parity coverage.
- `packages/otto/tests/channels/telegram-adapter-compliance.test.ts` - contract compliance tests.

## Acceptance Criteria

- Telegram passes canonical adapter compliance checks.
- Existing Telegram flows behave the same for operator-facing functionality.
- Runtime startup and shutdown paths remain stable.
- Scheduler and internal APIs send to Telegram through channel-generic contracts only.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/telegram-adapter-compliance.test.ts`
- `pnpm -C packages/otto exec vitest run tests/telegram-worker/worker.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable Telegram migration slice with no external behavior regressions.
