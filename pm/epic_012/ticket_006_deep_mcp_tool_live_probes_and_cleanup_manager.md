# Ticket 006 - Deep MCP/Tool Live Probes and Cleanup Manager

## Status

- `state`: `planned`

## Objective

Add live deep probes for enabled MCP/tool integrations, including mutating probe execution and deterministic cleanup orchestration.

## Scope

- Implement live probe executor for integration checks.
- Support mutating probe lifecycle:
  - pre-check contract validation
  - execution
  - cleanup
  - post-cleanup verification
- Enforce lock-key serialization for mutating probes per integration.
- Register initial probe set for currently enabled integrations.

## Non-Goals

- No remote target execution.
- No exhaustive coverage for every future integration in one ticket.

## Dependencies

- `ticket_004_deep_extension_requirements_and_probe_contracts.md`
- `ticket_005_deep_job_pipeline_mutating_probe_and_cleanup.md`

## Planned File Changes

- `packages/otto/src/doctor/probes/executor.ts` - probe execution adapter.
- `packages/otto/src/doctor/probes/mcp-tool.ts` - live MCP/tool probe implementations.
- `packages/otto/src/doctor/probes/cleanup-manager.ts` - ordered cleanup orchestration.
- `packages/otto/src/doctor/checks/deep/mcp-tool-live.ts` - deep check registration.
- `packages/otto/tests/doctor/deep-mcp-tool-live.test.ts` - integration probe tests.
- `packages/otto/tests/doctor/cleanup-manager.test.ts` - cleanup ordering/rollback tests.

## Acceptance Criteria

- Deep mode executes live MCP/tool probes for configured integrations.
- Mutating probes always run cleanup path and verify result.
- Probes without guaranteed cleanup remain skipped with clear reason.
- Integration failures include actionable, sanitized evidence.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/deep-mcp-tool-live.test.ts`
- `pnpm -C packages/otto exec vitest run tests/doctor/cleanup-manager.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable deep integration slice with cleanup safety guarantees.
