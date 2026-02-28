# Ticket 008 - Control Plane Prompt Management UI and BFF

## Status

- `state`: `planned`

## Objective

Ship control-plane prompt management so operators can inspect prompt files/routing/provenance and edit user-owned prompts from the web surface.

## Scope

- Add BFF endpoints to list/read/write prompt files with strict path ownership rules.
- Add control-plane views for:
  - prompt file inventory (system vs user)
  - user prompt file editing
  - effective chain/provenance inspection
- Reuse existing control-plane architecture and styling conventions.
- Add tests for API and UI interactions.

## Non-Goals

- Collaborative editing workflows.
- Prompt version diff history UI.
- Refactor of tools/permissions controls.

## Dependencies

- Ticket 003
- Ticket 006

## Acceptance Criteria

- Web user can list system/user prompt files and view content.
- Web user can edit/save user-owned prompt files only.
- Effective prompt chain/provenance is visible for recent executions.
- Path traversal/out-of-scope writes are blocked with safe errors.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto-control-plane exec vitest run tests/**/*.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/external-api/**/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto-control-plane run check`
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable incrementally with BFF endpoint and route additions; no mandatory runtime migration beyond prior provenance support.
