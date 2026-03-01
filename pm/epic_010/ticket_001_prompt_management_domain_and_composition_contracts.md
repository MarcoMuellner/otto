# Ticket 001 - Prompt Management Domain and Composition Contracts

## Status

- `state`: `done`

## Objective

Create a dedicated prompt-management domain that defines layer types, ordering, composition behavior, and typed resolution outputs.

## Scope

- Add `prompt-management` module under `packages/otto/src/`.
- Define layer model for `core-persona`, `surface`, `media`, and optional `task-profile`.
- Implement deterministic composition order and segment assembly for Markdown prompt content.
- Add typed warning/result model for missing or invalid layers.
- Add focused unit tests for resolution order and error-handling semantics.

## Non-Goals

- Runtime wiring into Telegram/scheduler execution paths.
- Filesystem directory deployment changes.
- API or SQLite schema changes.

## Dependencies

- None.

## Acceptance Criteria

- Prompt resolver API exists with explicit inputs and deterministic output shape.
- Resolver always applies layer order `core -> surface -> media -> task-profile`.
- Missing layers resolve without crash and are represented in resolution diagnostics.
- Unit tests cover order guarantees and layer omission behavior.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/prompt-management/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable as internal domain scaffolding with no runtime behavior change.
