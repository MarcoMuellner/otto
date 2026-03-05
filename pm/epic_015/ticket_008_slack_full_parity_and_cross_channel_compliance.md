# Ticket 008 - Slack Full Parity and Cross-Channel Compliance

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Complete Slack feature parity against the canonical baseline (where provider supports capability) and enforce cross-channel compliance testing for Telegram + Slack.

## Scope

- Implement Slack parity across inbound/outbound text, media/file, voice/audio+transcription flow where supported, dedupe, priority, status, and session bindings.
- Add cross-channel contract compliance suite asserting equivalent behavior semantics.
- Harden rollout with runbook updates, failure handling, and observability checks.

## Non-Goals

- No additional channels (email/matrix).
- No external adapter SDK packaging.
- No multi-workspace Slack.

## Dependencies

- `pm/epic_015/ticket_006_telegram_adapter_contract_migration_and_parity_regression.md`
- `pm/epic_015/ticket_007_slack_adapter_foundation_socket_mode_single_workspace.md`

## Planned File Changes

- `packages/otto/src/channels/adapters/slack/adapter.ts` - parity completion.
- `packages/otto/src/channels/adapters/slack/capabilities.ts` - provider capability mapping.
- `packages/otto/src/channels/compliance/adapter-compliance.ts` - reusable compliance checks.
- `packages/otto/tests/channels/slack/slack-adapter-compliance.test.ts` - Slack contract tests.
- `packages/otto/tests/channels/cross-channel-parity.test.ts` - Telegram vs Slack parity semantics.
- `packages/otto-control-plane/app/features/chat/contracts.ts` - channel-neutral source/surface updates if required.
- `pm/epic_015/rollout_runbook.md` - rollout and rollback playbook.

## Acceptance Criteria

- Slack passes canonical adapter compliance checks for supported capabilities.
- Telegram and Slack both pass cross-channel parity test suite.
- Interactive + scheduler/watchdog/background flows work end-to-end on both channels.
- Observability includes per-channel status/error visibility with correlation context.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/slack/slack-adapter-compliance.test.ts`
- `pnpm -C packages/otto exec vitest run tests/channels/cross-channel-parity.test.ts`
- `pnpm -C packages/otto run check`
- `pnpm run check`

## Deployability

- Deployable final parity slice enabling production Telegram + Slack operation on one unified channel architecture.
