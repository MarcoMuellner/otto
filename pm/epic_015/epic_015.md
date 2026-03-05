# Epic 015 - Channel Abstraction for Telegram + Slack Full Parity

## Status

- `id`: `epic_015`
- `type`: epic ticket
- `category`: `feature`
- `state`: `planned`
- `goal`: ship one channel-agnostic inbound/outbound architecture so Telegram and Slack run through the same contract, routing, queueing, dedupe, priority, and delivery lifecycle.

## Why

Messaging behavior is currently coupled to Telegram-specific runtime, scheduler, and internal API paths. This slows new channel delivery and forces channel-specific automation behavior.

## Decisions Locked In

- MVP is full parity from day one across Telegram and Slack.
- Canonical contract baseline is the current Telegram capability set.
- Channel support follows provider capability truth: if provider supports a baseline capability, adapter must implement it.
- Slack integration uses Slack App + Bot token + Socket Mode.
- Single Slack workspace is enough for this epic.
- Internal adapter registry now; boundary must be designed so external adapter pluginization can be added later without breaking changes.
- Existing Telegram behavior must not regress.

## Contract Baseline (Canonical Channel Capabilities)

- Inbound text.
- Inbound voice/audio with transcription flow.
- Inbound media/doc/photo intake.
- Outbound text with channel-safe chunking/fallback handling.
- Outbound file/photo.
- Dedupe semantics.
- Priority queue semantics.
- Delivery status lifecycle (`queued` / `sent` / `failed` / `cancelled`) with retry metadata.
- Session binding + routing key resolution.
- Typing/presence signal where provider supports it (best effort).

## Success Criteria

- Telegram and Slack interactive + automation flows run via the same channel contract and queue pipeline.
- Scheduler and internal API paths no longer depend on Telegram-specific enqueue contracts.
- Channel-neutral session bindings and routing are in place.
- Compatibility aliases exist for Telegram legacy tool paths during migration.
- Tests prove parity behavior and prevent Telegram regression.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: canonical channel contract and internal registry boundaries.
2. `ticket_002`: channel-neutral persistence and binding migrations.
3. `ticket_003`: unified outbound queue and dispatcher.
4. `ticket_004`: unified inbound pipeline and session binding resolution.
5. `ticket_005`: internal API/scheduler/tooling migration to channel-generic contracts.
6. `ticket_006`: Telegram adapter migration to canonical contract with parity tests.
7. `ticket_007`: Slack adapter foundation (single workspace, Socket Mode).
8. `ticket_008`: Slack full parity completion, cross-channel compliance tests, and rollout hardening.

## Out of Scope

- Email and Matrix implementations.
- Multi-workspace Slack.
- External third-party adapter SDK packaging.
- Historical backfill/rewrite of old Telegram records beyond compatibility reads.
- Control-plane redesign beyond contract updates required for channel neutrality.
