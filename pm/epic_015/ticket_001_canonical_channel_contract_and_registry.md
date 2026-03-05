# Ticket 001 - Canonical Channel Contract and Registry

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Define the canonical channel contract (Telegram baseline) and create an internal adapter registry boundary that enables future external pluginization without breaking changes.

## Scope

- Introduce channel-domain contracts for inbound/outbound payloads, targets, delivery state, capabilities, and routing context.
- Add internal channel registry interfaces and adapter lifecycle hooks.
- Define compatibility and capability rules that every adapter must satisfy.
- Add contract-focused unit tests.

## Non-Goals

- No migration of Telegram runtime behavior yet.
- No Slack runtime implementation yet.
- No persistence schema changes yet.

## Dependencies

- None.

## Planned File Changes

- `packages/otto/src/channels/contracts.ts` - canonical channel contract types and invariants.
- `packages/otto/src/channels/registry.ts` - adapter registry interfaces and resolution.
- `packages/otto/src/channels/capabilities.ts` - capability gates and validation helpers.
- `packages/otto/tests/channels/contracts.test.ts` - contract coverage.
- `packages/otto/tests/channels/registry.test.ts` - registry behavior coverage.
- `pm/epic_015/epic_015.md` - progress tracking.

## Acceptance Criteria

- Canonical contract includes all baseline capabilities defined in `epic_015`.
- Capability validation is deterministic and tested.
- Registry can resolve adapters by channel id and produce clear errors when missing.
- Public runtime modules can depend on registry without importing Telegram-specific code.

## Verification

- `pnpm -C packages/otto exec vitest run tests/channels/contracts.test.ts`
- `pnpm -C packages/otto exec vitest run tests/channels/registry.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable architecture slice; no behavior change in production paths.
