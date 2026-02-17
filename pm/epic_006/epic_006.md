# Epic 006 - Monorepo Extension Platform (OpenCode-Native)

## Status

- `id`: `epic_006`
- `type`: epic ticket
- `state`: `planned`
- `goal`: deliver a monorepo-based extension platform where Otto can install, enable, and validate versioned extensions that contribute OpenCode tools, skills, and MCP definitions without hardcoded runtime logic.

## Why

Otto needs fast capability growth without repeatedly editing core runtime code. We already rely on OpenCode primitives (tools, skills, MCP, permissions), so the right model is to package and install these primitives as versioned extensions managed by `ottoctl`.

## Decisions Locked In

- Monorepo packages are:
  - `packages/otto` (runtime, scheduler, internal API, CLI behavior)
  - `packages/otto-extension-sdk` (shared extension contract validation library)
  - `packages/otto-extensions` (curated extension catalog)
- Extension model is unified: one extension may include tools, skills, MCP config, and config overlays.
- Otto does not implement a parallel capability engine; extension payloads map to OpenCode-native configuration.
- Extension lifecycle separates install and enable:
  - install places a version in local extension store
  - enable activates selected version for runtime use
- Scheduled lane remains minimal-by-default and extension usage in scheduled runs must be explicit via profile/lane overlay.

## Success Criteria

- Monorepo workspace builds and tests successfully with no runtime regression.
- Extension catalog supports versioned manifests and deterministic validation.
- `ottoctl extension` can list/install/enable/disable/remove/doctor extensions from local catalog.
- Enabled extensions can contribute tools, skills, and MCP definitions through OpenCode config overlays.
- Extension activation state is durable and auditable.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Monorepo workspace split into `packages/otto` and `packages/otto-extensions`.
2. `ticket_002`: Extension manifest schema, catalog layout, and validator.
3. `ticket_003`: Runtime extension store and activation-state persistence.
4. `ticket_004`: `ottoctl extension list/install/remove` command set.
5. `ticket_005`: `ottoctl extension enable/disable` with tool and skill activation wiring.
6. `ticket_006`: MCP extension activation and `ottoctl extension doctor` requirement checks.
7. `ticket_007`: Scheduled-lane profile scoping for extension usage.
8. `ticket_008`: Upgrade migration, docs, and end-to-end verification suite.

## Out of Scope for Epic 006

- Public internet extension marketplace.
- Auto-install from untrusted sources.
- Cross-machine extension sync.
- Dynamic hot-reload of extension activation without controlled restart/reconfigure path.
