# Ticket 006 - Prompt Provenance Persistence and API Visibility

## Status

- `state`: `planned`

## Objective

Persist and expose prompt provenance so operators can verify which prompt layers/files were applied for each execution.

## Scope

- Extend persistence model (SQLite) to store prompt provenance per run/session context.
- Include ordered layer references/source in persisted metadata.
- Expose provenance through existing runtime API read surfaces used by CLI/web.
- Add migration and repository tests for backward compatibility.

## Non-Goals

- Full prompt text history/versioning storage.
- New dedicated provenance UI (covered in later ticket).
- Changes to task mutation semantics.

## Dependencies

- Ticket 005

## Acceptance Criteria

- Each relevant run/session record contains resolvable prompt provenance metadata.
- Existing reads continue to work for legacy rows without provenance.
- API read responses include provenance fields in a stable shape.
- Provenance errors are logged without blocking execution completion.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/persistence/*.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/internal-api/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable with additive SQLite migration and backward-compatible API extension.
