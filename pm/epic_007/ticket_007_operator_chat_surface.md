# Ticket 007 - Operator Chat Surface

## Status

- `state`: `planned`

## Objective

Add an operator chat surface to the control plane by integrating directly with OpenCode session/message APIs, reusing persisted Otto session IDs as the primary thread anchors.

## Why

Otto chat state is fundamentally OpenCode session state. For this slice, avoid introducing runtime external chat transport contracts and instead use OpenCode APIs directly, while still honoring Otto-owned persisted session bindings.

## Scope

- Add control-plane server OpenCode chat client using official SDK session/message APIs.
- Build thread index from persisted session IDs (session bindings) and enrich with OpenCode session metadata.
- Add chat UI route with thread list, message history, compose/send, and selected-thread refresh.
- Add required states: loading, empty, error, reconnect/degraded.
- Add chat BFF endpoints in control-plane process (browser does not call OpenCode directly by default).
- Enable command palette navigation entry for chat.
- Add audit logging for chat read/send actions using the same operational audit model used by existing control-plane operations.

## Interfaces and Contracts

- OpenCode upstream APIs (via SDK/server):
  - `session.list()`
  - `session.get({ path: { id } })`
  - `session.messages({ path: { id } })`
  - `session.prompt({ path: { id }, body })`
  - `session.create({ body })`
  - optional: `session.status()` for degraded indicators
- Control-plane BFF endpoints:
  - `GET /api/chat/threads`
  - `GET /api/chat/threads/:id/messages`
  - `POST /api/chat/threads/:id/messages`
  - `POST /api/chat/threads`
- Persisted session-id source:
  - Otto state DB `session_bindings` (existing binding patterns remain source of truth for known threads)

## Non-Goals

- Browser-direct OpenCode calls as default transport.
- Streaming token rendering in MVP.
- Multi-user chat or RBAC.
- In-chat workflow authoring.
- New runtime `/external/chat/*` endpoints for this ticket.

## Dependencies

- `ticket_002` (control-plane process and BFF foundation).
- Existing runtime session persistence and bindings already produced by Telegram/scheduler flows.
- OpenCode server availability in runtime (`opencode` service state).

## Engineering Principles Applied

- **TDD**: add failing server contract tests first for threads/messages/send.
- **DRY**: one shared OpenCode chat adapter and one session-index mapping layer.
- **SOLID**: separate OpenCode transport, thread-index resolution, and UI state logic.
- **KISS**: polling-based refresh and deterministic send flow before advanced streaming UX.

## Acceptance Criteria

- Operator can open chat surface, load threads, inspect messages, and send a message end-to-end.
- Thread list prioritizes persisted/bound sessions and remains usable even when some sessions are stale.
- UI clearly reports runtime/OpenCode degradation and supports reconnect/retry.
- Command palette Chat entry is enabled and navigates to chat surface.
- Chat actions are auditable with consistent operational metadata.

## Verification

- Control-plane server tests:
  - OpenCode chat client adapter contract/parse/error behavior.
  - `/api/chat/threads`, `/api/chat/threads/:id/messages`, `/api/chat/threads/:id/messages` (POST) route tests.
- Control-plane route/state tests for loading/empty/error/degraded behavior.
- Manual smoke: open existing bound session, send prompt, verify message appears in thread, verify degraded/reconnect behavior by stopping/restarting runtime.
- Quality gates:
  - `pnpm -C packages/otto-control-plane run check`
  - `pnpm run check` (if cross-package changes are introduced)

## Deployability

- Deployable operator chat slice meeting MVP priority #3 using direct OpenCode session/message integration.

## Jobs Involvement

- Jobs are not a core dependency for this ticket's primary chat send/read path.
- Jobs are adjacent via stored session bindings (for example scheduler-originated session IDs) and may be surfaced as thread metadata/deep links only.
- No jobs mutation or scheduler behavior changes are included in this ticket.
