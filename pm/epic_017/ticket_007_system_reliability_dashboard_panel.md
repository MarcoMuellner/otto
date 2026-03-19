# Ticket 007 - System Reliability Dashboard Panel

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Add an MVP reliability dashboard section on `/system` showing active provider state and recent failover health events.

## Scope

- Add System page panel/cards for:
  - active provider
  - last switch reason/time
  - recent health checks
  - recent switch events and failover count
- Wire loader/client calls to new reliability BFF endpoints.
- Add degraded/empty states when runtime data is unavailable.
- Keep UI mobile-friendly and aligned with existing System page visual language.

## Non-Goals

- No token/cost billing analytics.
- No provider-order editing in System.
- No chart-heavy historical analytics.

## Dependencies

- `ticket_005_reliability_snapshot_api_and_bff_contracts.md`
- `ticket_006_settings_global_primary_secondary_editor.md`

## Planned File Changes

- `packages/otto-control-plane/app/routes/system.tsx` - add reliability section.
- `packages/otto-control-plane/app/components/*` - reliability widgets if extracted.
- `packages/otto-control-plane/tests/routes/*.test.ts` - system route render/state tests.
- `packages/otto-docs/docs/operator-guide/*.md` - system reliability docs.

## Acceptance Criteria

- System page displays current active provider and last switch metadata.
- Recent checks/switches are visible with clear status tones and timestamps.
- Failures in data load show actionable degraded-state copy.
- Mobile layout preserves readability and operability.

## Verification

- `pnpm -C packages/otto-control-plane exec vitest run tests/routes/*.test.ts`
- `pnpm -C packages/otto-control-plane run check`

## Deployability

- Deployable observability slice with no write-path risk.
