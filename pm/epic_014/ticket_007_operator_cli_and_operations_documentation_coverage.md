# Ticket 007 - Complete Operator CLI and Operations Documentation

## Status

- `state`: `done`
- `category`: `feature`
- `implementation`: `done`

## Objective

Deliver complete, release-matched operator documentation for `ottoctl`, runtime/control-plane/docs-service operations, and common troubleshooting workflows.

## Scope

- Document all existing `ottoctl` command groups and options.
- Add workflow guides for setup, lifecycle management, updates, health checks, and incident triage.
- Document docs service behavior and static-vs-live split.
- Add troubleshooting pages tied to runtime states, limits, and risks surfaced in live views.

## Non-Goals

- No new CLI features.
- No migration of legacy commands that are out of current release scope.
- No localization.

## Dependencies

- `pm/epic_014/ticket_003_docs_service_runtime_process_and_ottoctl_lifecycle.md`
- `pm/epic_014/ticket_005_deployed_live_docs_views_with_token_auth.md`

## Planned File Changes

- `packages/otto-docs/docs/**` - CLI reference, operator runbooks, troubleshooting sections.
- docs navigation and sidebar config updates.
- versioned docs metadata updates.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- `ottoctl` command surface in docs matches current release behavior.
- Operators can execute key lifecycle and troubleshooting flows from docs alone.
- Docs clearly explain when to use static/public docs versus deployed/live docs.
- Broken links/anchors are eliminated in docs checks.

## Verification

- `pnpm -C packages/otto-docs run build`
- `pnpm -C packages/otto-docs run check`
- Manual smoke run for top operator workflows against local preview.

## Deployability

- Deployable documentation coverage increment with no runtime behavior changes required.

## Implementation Notes

- Replaced placeholder docs with release-matched operator documentation across `packages/otto-docs/docs/cli-reference/**` and `packages/otto-docs/docs/operator-guide/**`.
- Documented full `ottoctl` command surface from `packages/otto/bin/ottoctl`, including lifecycle, setup/config, tasks (`run-now` included), model, prompt, extension, doctor, and update commands.

## Historical Note (2026-03)

- Heartbeat command documentation originally added by this ticket was removed when scheduler heartbeat was deprecated.
- Added operator runbooks for setup, lifecycle, update, incident triage, and troubleshooting workflows tied to runtime live-view signals (`state`, `processes`, `limits`, `sources`, `openRisks`).
- Added explicit static-vs-live documentation boundary guidance for public docs and deployed token-authenticated live docs usage.
- Updated docs sidebar navigation to include all new CLI reference and operator-guide pages.
