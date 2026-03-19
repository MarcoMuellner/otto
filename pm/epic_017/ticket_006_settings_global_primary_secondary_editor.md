# Ticket 006 - Settings Global Primary/Secondary Editor

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Replace lane-scoped model defaults in Settings with one global, mobile-friendly primary/secondary model-order editor.

## Scope

- Remove lane-specific model default controls from Settings.
- Add global `primary` and `secondary` selectors backed by model catalog data.
- Validate selections and enforce server-side contract compatibility.
- Ensure responsive/mobile layout and touch-friendly interactions.
- Add route/component tests for happy-path and error states.

## Non-Goals

- No reliability history visualizations.
- No interactive-lane tool implementation.
- No additional page creation; Settings remains the edit surface.

## Dependencies

- `ticket_002_global_primary_secondary_contract_and_compat_migration.md`
- `ticket_005_reliability_snapshot_api_and_bff_contracts.md`

## Planned File Changes

- `packages/otto-control-plane/app/routes/settings.tsx` - replace model defaults section.
- `packages/otto-control-plane/app/features/models/*` - shared picker state and contract updates.
- `packages/otto-control-plane/app/server/api-models-*.server.ts` - route wiring updates.
- `packages/otto-control-plane/tests/routes/*.test.ts` - settings/api route coverage.
- `packages/otto-docs/docs/operator-guide/*.md` - settings behavior docs.

## Acceptance Criteria

- Settings shows exactly two global slots: primary and secondary.
- Changes persist through runtime API and apply immediately.
- Existing lane-specific controls are removed from UI and route payloads.
- Mobile viewport behavior is verified for core interaction flow.

## Verification

- `pnpm -C packages/otto-control-plane exec vitest run tests/routes/*.test.ts`
- `pnpm -C packages/otto-control-plane run check`

## Deployability

- Deployable control-plane configuration slice with immediate operator value.
