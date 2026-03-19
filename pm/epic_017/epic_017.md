# Epic 017 - Global Multi-Provider LLM Fallback and Reliability Dashboard

## Status

- `id`: `epic_017`
- `type`: epic ticket
- `category`: `feature`
- `state`: `planned`
- `goal`: replace per-lane model defaults with one global primary/secondary provider order, apply it across all lanes, auto-fail over using lightweight real health checks, and expose reliability visibility in System.

## Why

Otto currently relies on lane-scoped defaults and does not provide a first-class runtime reliability loop for provider outages or token exhaustion. This creates manual intervention overhead and inconsistent behavior across interactive, scheduled, and watchdog lanes.

## Decisions Locked In

- Replace per-lane model default settings with one global pair: `primary` and `secondary`.
- Apply active-provider selection across all lanes.
- Health loop runs every 10 minutes.
- Health check is a real minimal LLM generation call.
- Health check must use minimal prompt and disable tools/MCP context.
- Switching policy is hybrid:
  - Fail over from primary to secondary on first failed primary check.
  - Fail back to primary only after two consecutive successful primary checks.
- Reliability dashboard scope for MVP is operations-focused only (no billing/cost analytics).
- Provider order editing lives in `/settings`.
- Reliability visibility lives in `/system`.
- Interactive lane tooling can update provider order immediately (no approval gate).
- MVP supports exactly two slots, implemented in an extendable way for future expansion.

## Success Criteria

- Runtime uses one global provider order for all lanes.
- Primary/secondary config updates apply immediately and persist durably.
- Runtime auto-fails over and auto-fails back per hybrid policy.
- Reliability state/history survive runtime restarts.
- System page shows active provider, last switch, and recent reliability events.
- Settings page fully replaces lane-specific model-default controls.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: persistence schema and repositories for provider order + reliability history.
2. `ticket_002`: global provider-order contract and backward-compat migration from lane defaults.
3. `ticket_003`: runtime health-check worker and hybrid failover state machine.
4. `ticket_004`: all-lane active-provider routing integration.
5. `ticket_005`: external API and control-plane BFF contracts for reliability snapshot/history.
6. `ticket_006`: Settings page replacement with global primary/secondary editor (mobile-friendly).
7. `ticket_007`: System page reliability dashboard panel.
8. `ticket_008`: interactive-lane tooling to change provider order immediately.

## Out of Scope

- OpenAI billing/token/cost dashboard integration.
- Quality-based model routing.
- Tertiary or unlimited provider chains in MVP.
- Provider race execution and first-response selection.
