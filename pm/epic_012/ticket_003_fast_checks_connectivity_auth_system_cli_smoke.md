# Ticket 003 - Fast Checks: Connectivity, Auth, System, and CLI Smoke

## Status

- `state`: `planned`

## Objective

Deliver fast critical checks for update confidence in `ottoctl doctor` with red-capable failure semantics.

## Scope

- Add fast probe for external API connectivity + bearer auth (`/external/health`).
- Add fast probe for service/system snapshot (`/external/system/status`).
- Add critical service interpretation for fast mode status rollup.
- Add CLI smoke probes for critical command surfaces:
  - `ottoctl task list`
  - `ottoctl model list`
  - `ottoctl extension list`
- Capture sanitized probe evidence for output/reporting.

## Non-Goals

- No deep integration probes.
- No mutating checks.

## Dependencies

- `ticket_002_doctor_engine_phase_scheduler_and_result_model.md`

## Planned File Changes

- `packages/otto/src/doctor/checks/fast/connectivity.ts` - external health/auth check.
- `packages/otto/src/doctor/checks/fast/system-status.ts` - service status check.
- `packages/otto/src/doctor/checks/fast/cli-smoke.ts` - subprocess command checks.
- `packages/otto/src/doctor/checks/fast/index.ts` - fast check registration.
- `packages/otto/tests/doctor/fast-checks.test.ts` - fast probe tests.
- `packages/otto/tests/external-api/server.test.ts` - contract alignment assertions if needed.

## Acceptance Criteria

- `ottoctl doctor` returns green on healthy fast surfaces.
- Hard failures in fast critical checks can return red.
- Evidence includes command/endpoint status and timing without secret leakage.
- Fast mode remains within practical runtime budget.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/fast-checks.test.ts`
- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts -t "health"`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable operator value slice for quick post-update gating.
