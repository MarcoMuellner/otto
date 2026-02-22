# Ticket 002 - Scheduler Execution and Session Lifecycle

## Status

- `state`: `planned`

## Objective

Execute interactive background one-shot jobs through the existing scheduler and run each job in a dedicated OpenCode session lifecycle.

## Scope

- Add executor branch for background one-shot job type.
- Create and bind dedicated OpenCode session per run.
- Persist run lifecycle via existing `job_runs` and terminal state transitions.
- Ensure execution resources are cleaned up when run reaches terminal state.

## Non-Goals

- New worker service.
- Process-per-job architecture.
- Custom retry engine.

## Dependencies

- `ticket_001_background_job_contract_and_escalation.md`

## Acceptance Criteria

- Scheduler claims and executes background one-shot jobs correctly.
- Successful runs finalize with expected terminal state and run record.
- Failed runs finalize with expected terminal state/error fields and run record.
- Dedicated session lifecycle is observable (created for run, closed/stopped on terminal).

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/**/scheduler*`
  - `pnpm -C packages/otto exec vitest run tests/**/task-execution*`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable increment; background jobs can execute end-to-end even before cross-surface controls are added.
