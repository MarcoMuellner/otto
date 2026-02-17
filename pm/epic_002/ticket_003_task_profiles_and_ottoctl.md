# Ticket 003 - Task Profiles in Config and ottoctl Operations

## Objective

Support user-configurable task profile files in config space and provide control-plane commands to manage them.

## Why

Task behavior should be configurable by the operator without editing dist artifacts or hardcoding mappings.

## Scope

- Define task profile JSON/JSONC schema (including referenced OpenCode skill names).
- Load profiles from config directory (user-owned, non-dist path).
- Add `ottoctl` commands for profile install/list/validate.
- Persist task-to-profile mapping in DB.

## Non-Goals

- Task creation/deletion policy enforcement.
- Scheduler task execution logic.

## Dependencies

- `ticket_002`

## Acceptance Criteria

- Profiles can be installed and validated via `ottoctl`.
- Invalid profile files are rejected with clear diagnostics.
- Runtime resolves task profile mapping deterministically.

## Verification

- Schema validation tests.
- CLI command tests for profile operations.

## Deployability

- Deployable configuration layer with no automatic task execution changes.
