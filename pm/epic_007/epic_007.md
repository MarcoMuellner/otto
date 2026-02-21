# Epic 007 - Otto Web Control Plane

## Status

- `id`: `epic_007`
- `type`: epic ticket
- `state`: `planned`
- `goal`: deliver a deployable web control plane for Otto with a separate UI process and a runtime-owned external API, so Marco can run Otto day-to-day without CLI fallback for in-scope operations.

## Why

Otto now has strong runtime, scheduler, and tooling foundations, but operations are still fragmented across CLI and chat-first flows. A dedicated control plane gives one calm, command-oriented UI for jobs, system, settings, and chat while preserving runtime ownership of assistant logic.

## Decisions Locked In

- Primary user is single operator (Marco).
- MVP rollout order is:
  1. Jobs control
  2. System + settings ops
  3. Operator chat
- Jobs MVP covers scheduled/background jobs only.
- System-managed jobs are visible but read-only and visually separated.
- `Run now` is part of Jobs MVP.
- UI runs as a separate process from Otto runtime.
- External API runs in Otto runtime process (source of truth).
- Both UI and external API are LAN-accessible.
- All external API routes require bearer token auth.
- Reuse existing Otto API token source for external API auth.
- Frontend must never call Otto external API directly; all browser calls go through control-plane backend (BFF).
- UI stack is React + React Router 7 framework mode.
- Visual language follows:
  - `packages/ui-design/design-language-general.md`
  - `packages/ui-design/design-language-otto-paper-void.md`
  - `packages/ui-design/prototype/index.html`

## Engineering Principles (Non-Negotiable)

- **TDD-first**: each ticket begins with failing tests for contracts, behavior, and regressions.
- **DRY**: shared application services power both internal and external APIs; no copy-paste route logic.
- **SOLID**: keep boundaries explicit (API adapters, services, repositories, UI/BFF layers).
- **KISS**: prefer the simplest design that ships safely; avoid speculative abstraction and premature generalization.

## Success Criteria

- Operator can manage scheduled jobs via UI (list, inspect, create, edit, cancel, run-now) without CLI.
- External API is stable, authenticated, and source-of-truth aligned with runtime behavior.
- Secrets remain server-side; no token leakage to browser bundle or frontend requests.
- System and settings operations are available in UI as second deployable slice.
- Operator chat is available as third deployable slice.
- Each ticket is independently deployable and verified.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Runtime external API foundation and shared service extraction.
2. `ticket_002`: Separate control-plane process and BFF foundation.
3. `ticket_003`: Jobs read surface for scheduled lane with system/user separation.
4. `ticket_004`: Jobs mutation controls including run-now.
5. `ticket_005`: System status and runtime control operations.
6. `ticket_006`: Settings operations surface.
7. `ticket_007`: Operator chat surface.
8. `ticket_008`: Hardening, packaging, docs, and end-to-end validation.

## Out of Scope for Epic 007

- Native mobile/desktop apps.
- Multi-user support, RBAC, and SSO.
- Deep analytics dashboards.
- Workflow authoring.
- Frontend direct access to external API.
