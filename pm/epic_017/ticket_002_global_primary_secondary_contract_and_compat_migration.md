# Ticket 002 - Global Primary/Secondary Contract and Compatibility Migration

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Replace lane-scoped model-default configuration with one global `primary`/`secondary` contract while preserving backward compatibility for existing installations.

## Scope

- Define new global provider-order contract in model-management and external API schemas.
- Add compatibility mapping from prior `flowDefaults` data into global order.
- Update runtime config read/write paths to use global order as source of truth.
- Add tests for schema validation and migration behavior.

## Non-Goals

- No periodic health-check execution.
- No system dashboard rendering.
- No interactive tooling mutations.

## Dependencies

- `ticket_001_llm_provider_order_and_reliability_persistence_schema.md`

## Planned File Changes

- `packages/otto/src/model-management/contracts.ts` - add global order schemas/types.
- `packages/otto/src/config/otto-config.ts` - map old config to new global shape.
- `packages/otto/src/external-api/server.ts` - update model-management payload contracts.
- `packages/otto/tests/model-management/*.test.ts` - contract + compatibility tests.
- `packages/otto-docs/docs/cli-reference/models.md` - document new global model-order semantics.

## Acceptance Criteria

- API/runtime expose one global `primary` and `secondary` model setting.
- Existing installations using lane defaults boot without manual migration.
- Writes validate provider/model refs and reject malformed input.
- Compatibility behavior is explicitly covered by tests.

## Verification

- `pnpm -C packages/otto exec vitest run tests/model-management/*.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable contract migration slice with compatibility adapter in place.
