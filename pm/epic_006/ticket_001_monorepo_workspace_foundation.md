# Ticket 001 - Monorepo Workspace Foundation

## Status

- `state`: `completed`

## Objective

Introduce pnpm monorepo workspace structure with two packages (`packages/otto`, `packages/otto-extensions`) while preserving current runtime behavior.

## Why

Extension packaging and lifecycle require clear ownership boundaries between core runtime and extension catalog.

## Scope

- Add workspace root configuration and scripts.
- Move existing Otto code into `packages/otto` with minimal path/build changes.
- Create `packages/otto-extensions` package scaffold for extension catalog.
- Keep existing release artifact shape and install/update behavior unchanged.

## Non-Goals

- Extension install/enable behavior.
- New runtime capability behavior.

## Dependencies

- None.

## Acceptance Criteria

- `pnpm run check` passes from workspace root.
- Existing `packages/otto` build output remains deployable by current installer.
- CI and release workflow continue to pass without extension functionality changes.

## Verification

- Workspace smoke checks (`pnpm -r test`, `pnpm -r build`).
- Existing release pipeline dry-run/validation.

## Deployability

- Deployable refactor with no operator-visible feature change.
