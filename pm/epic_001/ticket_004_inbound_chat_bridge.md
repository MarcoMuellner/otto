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
- Keep one stable OpenCode session binding for the user DM chain (`telegram:chat:<chatId>:assistant`).

## Non-Goals

- No proactive scheduler jobs yet.
- No voice transcription yet.

## Dependencies

- `ticket_002`, `ticket_003`.

## Acceptance Criteria

- User message receives OpenCode response in Telegram.
- Session continuity is preserved across multiple messages.
- Inbound flow is compatible with shared proactive usage of the same session (single-chain model).
- Prompt timeout/abort path is handled and logged.

## Verification

- Unit tests for bridge components.
- Integration test with mocked Telegram/OpenCode clients.

## Deployability

- Deployable as minimal interactive Telegram assistant.
