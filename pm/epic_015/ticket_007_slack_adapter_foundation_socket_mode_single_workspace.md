# Ticket 007 - Slack Adapter Foundation (Socket Mode, Single Workspace)

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Add a production-ready Slack adapter foundation using Slack App + Bot token + Socket Mode, wired to the canonical channel contract.

## Scope

- Implement Slack adapter transport lifecycle (connect, receive, send, reconnect).
- Add Slack configuration and secret validation for a single workspace.
- Normalize Slack conversation/message identities to canonical target/source fields.
- Add adapter transport and config tests.

## Non-Goals

- No multi-workspace Slack support.
- No HTTP Events mode.
- No parity completion yet for all capability edge cases.

## Dependencies

- `pm/epic_015/ticket_001_canonical_channel_contract_and_registry.md`
- `pm/epic_015/ticket_003_unified_outbound_queue_and_dispatcher.md`
- `pm/epic_015/ticket_004_unified_inbound_pipeline_and_session_binding.md`

## Planned File Changes

- `packages/otto/src/channels/adapters/slack/adapter.ts` - Slack adapter implementation skeleton.
- `packages/otto/src/channels/adapters/slack/config.ts` - Slack config + secret validation.
- `packages/otto/src/channels/adapters/slack/transport.ts` - Socket Mode event transport.
- `packages/otto/src/runtime/serve.ts` - register/load Slack adapter.
- `packages/otto/tests/channels/slack/adapter.test.ts` - adapter tests.
- `packages/otto/tests/channels/slack/config.test.ts` - config validation tests.

## Acceptance Criteria

- Runtime can load Slack adapter for one configured workspace.
- Slack transport reconnect logic is tested and stable.
- Slack messages are normalized into canonical event/target structures.
- Outbound sends through generic dispatcher can reach Slack.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/slack/config.test.ts`
- `pnpm -C packages/otto exec vitest run tests/channels/slack/adapter.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable Slack foundation slice behind config-controlled adapter activation.
