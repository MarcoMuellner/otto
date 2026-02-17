# Epic 001 - Telegram Runtime Foundation

## Status

- `id`: `epic_001`
- `type`: epic ticket
- `state`: `completed`
- `completed_through_ticket`: `ticket_005`
- `goal`: deliver the production-ready Telegram runtime foundation (worker security, session continuity, persistence, outbound queue, and tool bridge plumbing).

## Outcome

Epic 001 delivered the required platform baseline:

- Telegram worker runtime integrated into service operation.
- Single-user DM gate and auditable deny logging.
- Durable SQLite persistence with migrations and repositories.
- Inbound Telegram text -> OpenCode session bridge with stable session continuity.
- Outbound queue with retry/dedupe semantics and delivery worker.
- OpenCode tool bridge via internal API for deterministic outbound enqueue.

## Decisions Locked In

- Single user only, strict 1:1 DM.
- Hard allowlist (`allowed_user_id`).
- No autonomous write actions during unsupervised runs without explicit approval.
- Completion can be inferred from user replies or external channel reconciliation (for example Google Tasks).
- Timezone and quiet-hours are user-specific and configurable.
- Telegram handling runs as a dedicated worker module/process, integrated into Otto service operation.
- Telegram UX follows a single conversational chain in one DM; Otto does not require thread-emulation references for normal operation.
- Inbound and proactive turns share one stable OpenCode session per user chat.
- Proactive actions are expressed via OpenCode tool/plugin calls (enqueue/approval tools), not by parsing free-form model output.

## Decision Record

### DR-001: Single-Chain Conversation Model

- `context`: Telegram DMs are linear and thread emulation felt unnatural for daily assistant use.
- `decision`: Keep one user-facing conversation chain and one stable OpenCode session per chat for both inbound and proactive turns.
- `consequence`: Context continuity is natural and intuitive; scheduling/queue reliability remains in Otto SQLite.

### DR-002: Tool-Driven Proactive Execution

- `context`: Parsing model text into actions adds fragility and hidden coupling.
- `decision`: Use OpenCode tool/plugin calls for actionable outcomes (`queue_telegram_message`, approval-related tools), then deliver via deterministic queue worker.
- `consequence`: Action execution is explicit, auditable, idempotent, and simpler to evolve safely.

## Success Criteria

- Telegram worker can receive messages and send replies reliably.
- Outbound queue and retries are restart-safe and auditable.
- Tool-driven enqueue path is operational through Otto internal API.
- Persistent state guarantees idempotency and observability for messaging flows.

## Delivered Tickets

1. `ticket_001`: Worker foundation and runtime wiring.
2. `ticket_002`: Security and single-user DM enforcement.
3. `ticket_003`: Persistent storage schema and repositories.
4. `ticket_004`: Inbound Telegram text flow and OpenCode session bridge.
5. `ticket_005`: Outbound message queue with retries and dedupe.

## Superseded Planning Note

Original Ticket 006-012 definitions in this folder are superseded by new epics:

- `pm/epic_002/` - Scheduler and task orchestration engine.
- `pm/epic_003/` - Proactive execution and approval-governed actions.
- `pm/epic_004/` - Heartbeats, onboarding, profile, and ops hardening.
- `pm/epic_005/` - Voice intake and multimodal input.

## Out of Scope for Epic 001

- Multi-user support.
- Group chat support.
- Fully autonomous write actions without approval.
- Non-Telegram primary channels.
