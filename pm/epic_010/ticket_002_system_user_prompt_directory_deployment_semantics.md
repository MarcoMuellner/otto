# Ticket 002 - System/User Prompt Directory Deployment Semantics

## Status

- `state`: `planned`

## Objective

Establish update-safe prompt file ownership by splitting shipped prompt assets from user-owned prompt files in Otto home.

## Scope

- Introduce deployed prompt roots:
  - `~/.otto/system-prompts/` (always overwritten on setup/update)
  - `~/.otto/prompts/` (never overwritten when already present)
- Add shipped prompt assets/templates under `packages/otto/src/assets/`.
- Update workspace deployment logic to enforce overwrite/preserve semantics.
- Extend runtime workspace tests to verify overwrite and preserve behavior.

## Non-Goals

- Prompt routing/mapping logic.
- Interactive/scheduler prompt injection.
- CLI/web prompt editor surfaces.

## Dependencies

- Ticket 001 (recommended for shared model naming, not strictly required).

## Acceptance Criteria

- Setup/update always refreshes files under `system-prompts`.
- Existing files under `prompts` are preserved unchanged during setup/update.
- Fresh install seeds baseline user prompt files when absent.
- Tests assert both overwrite and preserve semantics.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/runtime/workspace.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable through normal `ottoctl setup`/update flow with no DB migration.
