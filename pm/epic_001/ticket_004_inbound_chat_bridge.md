# Ticket 004 - Inbound Telegram Chat Bridge

## Objective

Implement inbound 1:1 text message handling from Telegram to OpenCode sessions, including reply delivery back to Telegram.

## Why

Two-way communication starts with reliable inbound message processing and consistent session reuse.

## Scope

- Integrate Telegram bot library in worker.
- Handle inbound text DMs from authorized user.
- Persist inbound/outbound message records.
- Bridge to OpenCode SDK session prompt flow.
- Return assistant replies to DM.
- Add per-chat in-flight guard and timeout handling.

## Non-Goals

- No proactive scheduler jobs yet.
- No voice transcription yet.

## Dependencies

- `ticket_002`, `ticket_003`.

## Acceptance Criteria

- User message receives OpenCode response in Telegram.
- Session continuity is preserved across multiple messages.
- Prompt timeout/abort path is handled and logged.

## Verification

- Unit tests for bridge components.
- Integration test with mocked Telegram/OpenCode clients.

## Deployability

- Deployable as minimal interactive Telegram assistant.
