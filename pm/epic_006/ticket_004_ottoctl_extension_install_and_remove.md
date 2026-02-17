# Ticket 004 - `ottoctl extension` Install and Remove Commands

## Objective

Add CLI commands to discover and install/remove catalog extensions into local versioned store.

## Why

Operators need a simple control plane to fetch curated capabilities without editing runtime files manually.

## Scope

- Add command group:
  - `ottoctl extension list`
  - `ottoctl extension install <id>[@version]`
  - `ottoctl extension remove <id>[@version]`
- Resolve extension source from local bundled catalog (`packages/otto-extensions`).
- Copy extension assets into `~/.otto/extensions/store/<id>/<version>`.
- Persist install/remove state using extension state model.
- Enforce safe remove behavior (cannot remove active enabled version).

## Non-Goals

- Enabling/disabling extensions for runtime use.
- MCP health/auth flows.

## Dependencies

- `ticket_003`.

## Acceptance Criteria

- Operator can list catalog and installed versions.
- Install is deterministic and idempotent for same version.
- Remove command preserves active safety guardrails.

## Verification

- CLI tests for install/list/remove paths.
- Filesystem state assertions after each command.

## Deployability

- Deployable operator tooling; no runtime activation yet.
