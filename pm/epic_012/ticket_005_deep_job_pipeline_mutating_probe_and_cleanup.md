# Ticket 005 - Deep Job Pipeline Mutating Probe and Cleanup

## Status

- `state`: `planned`

## Objective

Validate job pipeline health end-to-end in deep mode using a controlled mutating probe with strict cleanup verification.

## Scope

- Add deep mutating probe that:
  - creates a temporary `doctor.*` oneshot job
  - triggers execution path
  - validates run completion/result
  - performs cleanup (cancel/delete as needed)
  - verifies no residual doctor artifacts remain
- Capture reproducible evidence (job id, run id, status transitions, durations).
- Classify cleanup failure as non-green with explicit reason.

## Non-Goals

- No scheduler throughput benchmarking.
- No control-plane surface work.

## Dependencies

- `ticket_004_deep_extension_requirements_and_probe_contracts.md`

## Planned File Changes

- `packages/otto/src/doctor/checks/deep/job-pipeline.ts` - mutating job probe.
- `packages/otto/src/doctor/probes/cleanup.ts` - cleanup execution and verification helpers.
- `packages/otto/src/doctor/adapters/external-api.ts` - typed helper for job probe calls.
- `packages/otto/tests/doctor/deep-job-pipeline.test.ts` - create/run/cleanup tests.
- `packages/otto/tests/external-api/server.test.ts` - endpoint contract compatibility tests.

## Acceptance Criteria

- Deep mode can verify job pipeline using real runtime APIs.
- Temporary doctor job artifacts are removed when cleanup succeeds.
- Cleanup failures are visible and affect final verdict.
- Probe remains deterministic enough for repeated local use.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/deep-job-pipeline.test.ts`
- `pnpm -C packages/otto exec vitest run tests/external-api/server.test.ts -t "jobs"`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable deep-value slice with one high-signal end-to-end mutating check.
