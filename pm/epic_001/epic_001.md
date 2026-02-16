# Epic 001 - Proactive Telegram Communication Platform

## Status

- `id`: `epic_001`
- `type`: epic ticket
- `goal`: deliver a production-ready two-way Telegram communication platform for Otto, including proactive messaging, scheduled heartbeats, approvals for write actions, and durable state.

## Why

Otto must move from reactive command handling to proactive daily assistance. Telegram is the primary interaction channel, so the platform must support both inbound chat handling and outbound autonomous nudges in a reliable, auditable way.

## Decisions Locked In

- Single user only, strict 1:1 DM.
- Hard allowlist (`allowed_user_id` / allowed chat id).
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

- Telegram worker can receive messages and send proactive messages reliably.
- One-shot scheduler runs every 1-2 minutes.
- Heartbeats run morning/midday/evening and produce useful outbound summaries.
- Approval flow blocks unsupervised writes until user confirmation.
- Persistent state guarantees idempotency, retries, and observability.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Worker foundation and runtime wiring.
2. `ticket_002`: Security and single-user DM enforcement.
3. `ticket_003`: Persistent storage schema and repositories.
4. `ticket_004`: Inbound Telegram text flow and OpenCode session bridge.
5. `ticket_005`: Outbound message queue with retries and dedupe.
6. `ticket_006`: Scheduler runtime (one-shot + heartbeat trigger framework).
7. `ticket_007`: Approval workflow for write actions.
8. `ticket_008`: Google Tasks integration and completion reconciliation.
9. `ticket_009`: Proactive one-shot evaluator and reminder delivery.
10. `ticket_010`: Heartbeat generation pipeline.
11. `ticket_011`: Voice message transcription pipeline.
12. `ticket_012`: Onboarding/profile (timezone + quiet hours) and operational hardening.

## Out of Scope for Epic 001

- Multi-user support.
- Group chat support.
- Fully autonomous write actions without approval.
- Non-Telegram primary channels.
