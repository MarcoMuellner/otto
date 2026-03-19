# Ticket 008 - Interactive Tooling for Provider-Order Mutation

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Allow the interactive lane to update global primary/secondary provider order immediately through runtime tools using the same contract as Settings.

## Scope

- Add or extend interactive tool contract for provider-order read/update.
- Route tool mutations through the same runtime service used by Settings API.
- Audit mutations with before/after model refs and actor context.
- Add tests for success, validation failure, and persistence/readback.

## Non-Goals

- No approval workflow gate.
- No new independent configuration store.
- No additional dashboard UI features.

## Dependencies

- `ticket_006_settings_global_primary_secondary_editor.md`
- `ticket_007_system_reliability_dashboard_panel.md`

## Planned File Changes

- `packages/otto/src/extensions/internal-tools/*` - tool schema and handler updates.
- `packages/otto/src/external-api/server.ts` or shared service layer - shared mutation path.
- `packages/otto/src/persistence/repositories.ts` - audit metadata fields if needed.
- `packages/otto/tests/external-api/server.test.ts` and tool tests.
- `packages/otto-docs/docs/operator-guide/*.md` - operator usage docs.

## Acceptance Criteria

- Interactive tool can update global primary/secondary configuration immediately.
- Mutation path reuses existing validation and persistence contracts.
- Audit records capture mutation context and before/after values.
- Updated provider order is visible in Settings and System without restart.

## Verification

- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts`
- `pnpm -C packages/otto exec vitest run tests/**/*.test.ts -t "provider order"`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable operator-automation slice that completes parity between UI and interactive control.
