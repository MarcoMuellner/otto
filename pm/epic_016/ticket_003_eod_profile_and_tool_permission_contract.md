# Ticket 003 - EOD Profile and Tool Permission Contract

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Define the scheduled task profile for EOD learning with a strict, least-privilege tool surface for memory, journal, scheduling, and reporting actions.

## Scope

- Add EOD task profile under `task-config/profiles`.
- Configure scheduled-lane prompt contract and strict JSON output expectations.
- Allow only required tools for EOD operations; deny everything else by default.
- Add profile merge tests to prevent permission regressions.

## Non-Goals

- No EOD decision logic.
- No new persistence schema.

## Dependencies

- `ticket_002` (system task should reference this profile).

## Planned File Changes

- `packages/otto/src/assets/task-config/profiles/eod-learning.jsonc` - EOD profile contract.
- `packages/otto/src/assets/task-config/base.jsonc` - baseline lane defaults if needed.
- `packages/otto/tests/scheduler/task-config.test.ts` - profile merge/permissions coverage.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- EOD profile is selectable by id and merged deterministically.
- Tool permissions align with EOD needs (memory+journal apply, task scheduling, digest delivery, audit reads).
- Scheduled output contract remains strict JSON and test-enforced.
- Profile changes do not broaden unrelated scheduled-task permissions.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/task-config.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable config slice; can ship safely before executor logic as profile is inert until referenced by task runs.
