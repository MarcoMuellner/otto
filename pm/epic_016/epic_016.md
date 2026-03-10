# Epic 016 - Daily EOD Learning Run with Auto-Evolving Memory

## Status

- `id`: `epic_016`
- `type`: epic ticket
- `category`: `feature`
- `state`: `planned`
- `goal`: run a nightly, evidence-gated End-of-Day learning cycle that analyzes the last 24h across all sessions/tasks, auto-evolves Otto memory+journal, stores full learning artifacts in SQLite, and sends a transparent Telegram digest.

## Why

Otto currently learns implicitly across sessions but has no durable, auditable daily loop that turns evidence into persistent memory evolution and concrete next-day improvements.

## Decisions Locked In

- Run as dedicated system scheduled task: `system-daily-eod-learning`.
- Trigger at user timezone midnight.
- Analyze all sessions/tasks in the previous 24h across lanes.
- Evidence gate for auto-apply: at least two independent signals and no contradiction.
- Conflict policy: skip auto-apply and persist as candidate.
- Confidence policy:
  - `>= 0.8`: auto-apply memory+journal and allow autonomous follow-up scheduling.
  - `0.6 - 0.79`: auto-apply memory+journal only.
  - `< 0.6`: store candidate only.
- No hard cap on follow-up scheduling count; enforce usefulness via reversible-only action policy and explicit confidence/value fields.
- Telegram must receive daily transparency digest.

## Success Criteria

- EOD task runs automatically each midnight in user timezone without manual intervention.
- Every run persists auditable artifacts in SQLite (run, items, evidence, actions).
- Qualified learning items auto-apply to memory+journal by threshold policy.
- Conflicting signals are never auto-applied.
- High-confidence reversible follow-up actions can be auto-scheduled.
- Telegram digest is emitted for run transparency.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: EOD persistence schema and repositories. (`done`)
2. `ticket_002`: system nightly task bootstrap and timezone-midnight scheduler semantics. (`done`)
3. `ticket_003`: EOD scheduled profile and tool permission policy.
4. `ticket_004`: 24h evidence aggregation service.
5. `ticket_005`: EOD decision engine and memory/journal auto-apply pipeline.
6. `ticket_006`: autonomous follow-up scheduling with reversible guardrails.
7. `ticket_007`: Telegram transparency digest delivery.
8. `ticket_008`: internal EOD history read API and OpenCode tools for self-reference.

## Out of Scope

- Human approval workflow for each nightly memory change.
- Hard numeric limit on auto-created follow-up tasks.
- Explicit rollback subsystem for prior memory updates.
- Control-plane analytics dashboard for EOD history (read API first).
