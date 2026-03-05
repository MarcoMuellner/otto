# Epic 014 - Otto Self-Awareness Transparency and Operator Docs Platform

## Status

- `id`: `epic_014`
- `type`: epic ticket
- `category`: `feature`
- `state`: `planned`
- `goal`: ship a version-bound, operator-first docs platform that also powers Otto self-awareness by exposing transparent runtime state, active processes, limits, decisions, and open risks through a deployed docs surface and internal tools.

## Why

Otto needs one trusted source where operators and Otto itself can answer what is happening now, why it is happening, what limits apply, and which risks are open. Today this context is fragmented across code, logs, and APIs.

## Decisions Locked In

- Docs stack is Docusaurus.
- Docs are version-bound to release tags.
- Public docs are static and deployed to GitHub Pages.
- Otto runtime deployment includes a separate docs service process.
- `ottoctl start|restart|stop` manage docs service as a third Otto service.
- Live runtime docs views are excluded from public docs.
- Live runtime docs views are token-authenticated.
- Live auth reuses existing external API token mechanism.
- Otto internal tools consume docs via docs service endpoints and handle auth automatically.
- No new `ottoctl docs ...` command surface in this epic.

## Success Criteria

- Operators can use one docs surface to understand contracts, operations, and current runtime state.
- Otto tools can search/open docs and cite version-matched sources.
- Deployed docs service exposes authenticated live self-awareness views.
- Public GitHub Pages docs remain static and never expose live runtime internals.
- CLI documentation is complete for current `ottoctl` behavior in the same release.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Docusaurus foundation, IA, and visual docs system.
2. `ticket_002`: Versioned docs build and GitHub Pages release publishing.
3. `ticket_003`: Separate Otto docs service and `ottoctl` lifecycle integration.
4. `ticket_004`: Live self-awareness API contract and OpenAPI updates.
5. `ticket_005`: Authenticated live docs views for deployed runtime.
6. `ticket_006`: Otto internal docs tools (`search`/`open`) with automatic auth.
7. `ticket_007`: Complete operator docs coverage for `ottoctl` and operations.
8. `ticket_008`: End-to-end hardening, security gates, and rollout runbook.

## Out of Scope

- In-app docs CMS/editing workflows.
- Docs comments/feedback system.
- Localization/multi-language support.
- Advanced docs analytics dashboards.
- Full historical decision replay UI beyond current-plus-recent operator needs.
