# Ticket 007 - Operator Chat Surface

## Status

- `state`: `planned`

## Objective

Add an operator chat surface to the control plane for viewing and sending messages through runtime-owned chat APIs.

## Why

Chat is a core Otto interaction mode and must be available in the same operational UI after jobs and system/settings are stable.

## Scope

- Add external API chat contracts for thread/message retrieval and message send.
- Add control-plane chat page with thread view, message history, and compose/send UX.
- Include loading, empty, error, and reconnect/degraded states.
- Ensure chat actions are logged/audited consistently with other operations.

## Interfaces and Contracts

- Runtime external endpoints:
  - `GET /external/chat/threads`
  - `GET /external/chat/threads/:id/messages`
  - `POST /external/chat/messages`
- Control-plane endpoints:
  - `GET /api/chat/threads`
  - `GET /api/chat/threads/:id/messages`
  - `POST /api/chat/messages`

## Non-Goals

- Multi-user chat.
- Advanced collaboration features.
- In-UI workflow authoring.

## Dependencies

- `ticket_001`
- `ticket_002`
- Runtime chat/session capabilities from prior epics

## Engineering Principles Applied

- **TDD**: contract tests and message-flow tests before UI polish.
- **DRY**: reuse shared runtime chat orchestration services and DTO mappers.
- **SOLID**: keep send/read services separate from UI component state.
- **KISS**: deliver reliable single-thread operator flow first.

## Acceptance Criteria

- Operator can open chat surface, load messages, and send a message end-to-end.
- UI reflects delivery state and errors clearly.
- Backend enforces token auth and preserves runtime as source of truth.
- Docs updated with chat limitations and operational expectations.

## Verification

- Endpoint tests for list/read/send contracts.
- UI integration tests for compose and thread loading paths.
- Manual smoke: send and observe message lifecycle through runtime logs.
- `pnpm run check`

## Deployability

- Deployable chat slice meeting MVP priority #3.
