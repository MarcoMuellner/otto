# Epic 009 - Interactive Background One-Shot Tasks

## Status

- `id`: `epic_009`
- `type`: epic ticket
- `state`: `planned`
- `goal`: enable Otto to auto-escalate long interactive requests into background one-shot jobs so Marco can continue chatting while work runs and completes asynchronously.

## Why

Interactive long-running tasks currently block chat flow. Marco wants Otto to delegate long work immediately, push natural updates to Telegram, and make task state visible from Telegram, CLI chat, and Control Plane UI.

## Decisions Locked In

- Single operator scope (Marco), global access across surfaces.
- Inline-first interaction; model decides when to escalate.
- Escalation is automatic and immediately acknowledged.
- Background runs are non-interruptible while running.
- New incoming messages remain independent while a run is active.
- Reuse existing jobs and scheduler mechanics.
- Background runs use dedicated OpenCode sessions.
- Cancellation reuses OpenCode session stop behavior.
- Telegram is the push channel for start/milestone/final updates.
- Milestones are free-text from the LLM via an internal tool, with rate limiting.
- Canonical cross-surface identifier is raw `job_id`.
- Control Plane reuses jobs UI with a dedicated background tab/filter.

## Success Criteria

- Telegram-originated long requests can be escalated to background with immediate acknowledgment.
- Background run lifecycle is persisted through existing jobs/job_runs state transitions.
- Telegram receives natural-language start, milestone, and final/failure updates.
- `list/show/cancel` works consistently in Telegram, CLI chat, and Web chat.
- Control Plane shows background one-shot runs in a dedicated filtered view using existing jobs surfaces.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Background job contract and escalation hook.
2. `ticket_002`: Scheduler execution path with dedicated session lifecycle.
3. `ticket_003`: Telegram lifecycle messaging and milestone tool.
4. `ticket_004`: Cross-surface list/show/cancel and cancel semantics.
5. `ticket_005`: Control Plane background tab/filter and parity checks.

## Out of Scope

- Pause/resume.
- Mid-run user intervention into active run context.
- Auto-retry/backoff policy.
- Multi-user auth/RBAC.
- Background task creation from CLI/Web in MVP.
- Telegram menu command UX in MVP (text understanding remains supported).
