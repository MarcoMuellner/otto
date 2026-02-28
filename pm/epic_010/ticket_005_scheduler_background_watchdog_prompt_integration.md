# Ticket 005 - Scheduler/Background/Watchdog Prompt Integration

## Status

- `state`: `planned`

## Objective

Apply hierarchical prompt resolution to scheduler execution, interactive background one-shots, and watchdog runs with watchdog remaining system-only.

## Scope

- Wire prompt resolver into scheduler execution engine for scheduled and one-shot jobs.
- Apply optional `task-profile` layer for jobs only (never for interactive chat turns).
- Resolve job media (`chatapps`/`web`/`cli`) with default `cli` when absent.
- Integrate watchdog prompt resolution through system-owned mapping/layers only.
- Extend scheduler tests for scheduled/background/watchdog resolution behavior.

## Non-Goals

- Tools/permissions refactor.
- CLI/web prompt editing surfaces.
- SQLite provenance schema expansion.

## Dependencies

- Ticket 001
- Ticket 003
- Ticket 004

## Acceptance Criteria

- Scheduled and background jobs use `core + surface + media + task-profile(optional)`.
- Watchdog uses explicit system prompt route and does not consume user prompt layers.
- Missing/invalid user layer handling remains log-and-empty without runtime failure.
- Existing task execution state transitions remain unchanged.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/scheduler/executor.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable with runtime restart and no mandatory schema migration.
