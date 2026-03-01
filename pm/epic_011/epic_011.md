# Epic 011 - Interactive Context Bridge for Non-Interactive Events

## Status

- `id`: `epic_011`
- `type`: epic ticket
- `state`: `planned`
- `goal`: restore interactive continuity by injecting recent non-interactive user-facing updates into Telegram and Web interactive turns.

## Why

Interactive turns currently miss state from background/one-shot and other non-interactive outbound updates. That causes follow-ups to lose continuity across Telegram and Control Plane chat.

## Decisions Locked In

- Canonical context key is `sourceSessionId`.
- Capture is middleware-style and independent from delivery success.
- Inject context into interactive turns only (not into background execution prompts).
- Capture payload is user-facing non-interactive outbound attempts plus delivery status.
- Include failed/unsent attempts with explicit status.
- Injection window default is `20` events.
- Retention cap is configurable, default `100`, valid range `5-200`.
- New events only (no historical backfill migration).
- Configuration is global and managed through existing settings flow (ottoctl assistant tool path + web settings).
- Telegram + Web parity in this epic; TUI parity is tracked as follow-up.

## Success Criteria

- Interactive Telegram follow-ups include recent non-interactive context from the same session.
- Interactive Web follow-ups include the same context behavior.
- Context includes delivery status (`queued`/`sent`/`failed`/policy-held variants).
- No cross-session leakage.
- Runtime settings can tune injection and retention limits within guardrails.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Context event persistence model and repository contract.
2. `ticket_002`: Non-interactive outbound capture middleware integration.
3. `ticket_003`: Delivery status mirroring and retention enforcement.
4. `ticket_004`: Telegram interactive prompt injection.
5. `ticket_005`: Control Plane web prompt injection parity.
6. `ticket_006`: Global settings surface (`ottoctl` flow + web) and docs.
7. `ticket_007`: TUI parity follow-up design + contract stub.

## Out of Scope

- Auto ticket/backlog generation from anomalies.
- Background-run prompt injection.
- Historical backfill for pre-deploy events.
- New standalone ottoctl subcommand for this feature.
