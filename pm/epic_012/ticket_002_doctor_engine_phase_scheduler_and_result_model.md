# Ticket 002 - Doctor Engine, Phase Scheduler, and Result Model

## Status

- `state`: `planned`

## Objective

Create an extendable doctor engine that executes checks in ordered phases with hybrid concurrency and produces deterministic verdict/result models.

## Scope

- Add doctor domain types (`run`, `check`, `verdict`, `severity`, `evidence`).
- Add check registry pattern for fast/deep tiered checks.
- Implement phase scheduler:
  - phase-level ordering
  - parallel execution for independent checks
  - lock-key serialization for mutating checks
- Add timeout and failure normalization primitives.
- Add verdict mapper (green/yellow/red) and internal-failure mapping.

## Non-Goals

- No integration-specific check logic.
- No terminal rendering/report persistence.

## Dependencies

- `ticket_001_doctor_cli_surface_and_contract.md`

## Planned File Changes

- `packages/otto/src/doctor/contracts.ts` - doctor run/check schemas and types.
- `packages/otto/src/doctor/engine.ts` - orchestrator and phase scheduler.
- `packages/otto/src/doctor/verdict.ts` - severity and verdict rollup logic.
- `packages/otto/src/doctor/locks.ts` - lock key serialization utility.
- `packages/otto/tests/doctor/engine.test.ts` - scheduler/ordering tests.
- `packages/otto/tests/doctor/verdict.test.ts` - verdict and exit mapping tests.

## Acceptance Criteria

- Engine supports fast-only and fast+deep plans.
- Independent checks can run in parallel within the same phase.
- Mutating checks sharing lock key never run concurrently.
- Engine returns deterministic output shape for downstream renderer/reporter.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/engine.test.ts`
- `pnpm -C packages/otto exec vitest run tests/doctor/verdict.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable backend foundation with no user-visible probe value yet.
