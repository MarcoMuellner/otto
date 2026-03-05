# Ticket 003 - Separate Docs Service and Ottoctl Lifecycle Integration

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Introduce a dedicated docs service process in Otto deployments and manage it via existing `ottoctl start|restart|stop` lifecycle commands.

## Scope

- Implement a standalone docs service process that serves docs artifacts.
- Add service install/start/stop wiring on Linux and macOS alongside runtime and control-plane services.
- Add runtime configuration for docs host/port/path.
- Ensure release artifact includes docs service executable assets.

## Non-Goals

- No live self-awareness data rendering yet.
- No new `ottoctl docs` command surface.
- No public GitHub Pages behavior changes beyond already published static docs.

## Dependencies

- `pm/epic_014/ticket_001_docs_foundation_docusaurus_ia_and_design_system.md`
- `pm/epic_014/ticket_002_release_versioning_and_github_pages_publish.md`

## Planned File Changes

- `packages/otto-docs-service/**` or equivalent runtime package for docs server.
- `packages/otto/bin/ottoctl` - third service lifecycle integration.
- release/build packaging config for docs service artifacts.
- service template assets/scripts for systemd and launchd wiring.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- `ottoctl start|restart|stop` controls docs service in addition to existing services.
- Deployed docs endpoint is reachable after standard startup flow.
- Service behavior is stable on Linux and macOS user-service modes.
- Logs clearly identify docs service startup and failure conditions.

## Verification

- `ottoctl start`
- `ottoctl restart`
- `ottoctl stop`
- Local smoke checks for docs endpoint availability on both supported platforms.

## Deployability

- Deployable infrastructure increment that adds docs service without changing live docs semantics.
