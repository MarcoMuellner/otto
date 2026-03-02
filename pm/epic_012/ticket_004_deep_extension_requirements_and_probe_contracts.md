# Ticket 004 - Deep Extension Requirements and Probe Contracts

## Status

- `state`: `planned`

## Objective

Introduce deep-check extension validation and probe contracts so live integration checks are explicit, extendable, and safe to execute.

## Scope

- Validate enabled extension requirements from manifests:
  - `requirements.env`
  - `requirements.files`
  - `requirements.binaries`
- Treat missing credentials/requirements as deep errors.
- Define doctor probe contract model for integrations:
  - probe id
  - mutating flag
  - cleanup required
  - cleanup guaranteed
  - lock key
- Implement skip gating when cleanup cannot be guaranteed before execution.

## Non-Goals

- No broad implementation of all integration live probes.
- No terminal rendering/report formatting.

## Dependencies

- `ticket_002_doctor_engine_phase_scheduler_and_result_model.md`
- `ticket_003_fast_checks_connectivity_auth_system_cli_smoke.md`

## Planned File Changes

- `packages/otto/src/doctor/checks/deep/extension-requirements.ts` - requirements validation.
- `packages/otto/src/doctor/probes/contracts.ts` - probe contract schema/types.
- `packages/otto/src/doctor/probes/registry.ts` - integration probe registry.
- `packages/otto/src/doctor/checks/deep/index.ts` - deep check registration.
- `packages/otto/tests/doctor/deep-extension-requirements.test.ts` - requirement pass/fail tests.
- `packages/otto/tests/doctor/probe-contracts.test.ts` - contract/skip gating tests.

## Acceptance Criteria

- Deep mode fails when required env/file/binary prerequisites are missing.
- Probe definitions can mark mutating behavior and cleanup guarantees.
- Probes lacking guaranteed cleanup are skipped pre-execution with explicit reason.
- Contract model is documented enough for adding new probes.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/deep-extension-requirements.test.ts`
- `pnpm -C packages/otto exec vitest run tests/doctor/probe-contracts.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable deep-readiness slice; live probes can be layered in next tickets.
