# Ticket 005 - Deployed Live Docs Views with Token Auth

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Add authenticated live self-awareness views to deployed docs while keeping public GitHub Pages docs static-only.

## Scope

- Build live docs pages/components for runtime state, active processes, limits, decisions, and risks.
- Add token-authenticated fetch flow for live data.
- Ensure public static docs build excludes live runtime content paths.
- Add clear UX markers for static versus live runtime content.

## Non-Goals

- No public exposure of live runtime internals.
- No advanced analytics or historical replay UI.
- No new auth mechanism beyond existing external API token.

## Dependencies

- `pm/epic_014/ticket_003_docs_service_runtime_process_and_ottoctl_lifecycle.md`
- `pm/epic_014/ticket_004_self_awareness_live_api_contract_and_openapi.md`

## Planned File Changes

- `packages/otto-docs/**` - live/self-awareness pages and runtime-aware components.
- docs service routing/proxy logic for authenticated live calls.
- docs build configuration for static/public vs deployed/live separation.
- tests for authenticated and unauthenticated rendering states.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Deployed docs show live runtime data only after valid token auth.
- Public GitHub Pages docs show static content only.
- Unauthorized live requests fail safely with clear operator feedback.
- Live view pages link back to relevant operator actions and references.

## Verification

- Deployed runtime smoke test for live views with valid token.
- Negative test with missing/invalid token.
- Public GitHub Pages smoke test confirms no live data rendering.

## Deployability

- Deployable live-docs increment with explicit auth boundary and public/static isolation.
