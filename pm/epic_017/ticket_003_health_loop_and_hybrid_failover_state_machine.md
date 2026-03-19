# Ticket 003 - Health Loop and Hybrid Failover State Machine

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Implement a 10-minute runtime health loop using minimal real LLM calls and enforce hybrid failover policy for active-provider switching.

## Scope

- Add a periodic health worker that checks provider health every 10 minutes.
- Use a minimal synthetic generation request (no tools, no MCP context, minimal prompt).
- Implement hybrid switching policy:
  - fail over on first failed primary check.
  - fail back only after two consecutive successful primary checks.
- Persist check outcomes and switch events through new repositories.
- Add unit/integration tests for switch/failback behavior and anti-flap semantics.

## Non-Goals

- No UI changes.
- No new API endpoints for dashboard consumption.
- No token/cost billing integration.

## Dependencies

- `ticket_001_llm_provider_order_and_reliability_persistence_schema.md`
- `ticket_002_global_primary_secondary_contract_and_compat_migration.md`

## Planned File Changes

- `packages/otto/src/model-management/*` - add health-check service and policy logic.
- `packages/otto/src/runtime/serve.ts` - bootstrap worker lifecycle.
- `packages/otto/src/scheduler/*` or equivalent runtime loop wiring.
- `packages/otto/tests/model-management/*.test.ts` - policy behavior tests.
- `packages/otto/tests/runtime/*.test.ts` - worker lifecycle coverage.
- `packages/otto-docs/docs/operator-guide/*.md` - reliability policy/runbook update.

## Acceptance Criteria

- Health check runs every 10 minutes by default.
- Health check uses tools-disabled, minimal prompt execution path.
- First failed primary check triggers active-provider switch to secondary.
- Failback to primary occurs only after two consecutive successful primary checks.
- State/history persistence updates on each check and switch.

## Verification

- `pnpm -C packages/otto exec vitest run tests/model-management/*.test.ts`
- `pnpm -C packages/otto exec vitest run tests/runtime/*.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable runtime reliability loop; behavior is immediately beneficial without UI changes.
