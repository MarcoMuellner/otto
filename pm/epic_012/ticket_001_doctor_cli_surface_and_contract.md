# Ticket 001 - Doctor CLI Surface and Exit Contract

## Status

- `state`: `planned`

## Objective

Add `ottoctl doctor` and `ottoctl doctor --deep` command surfaces with deterministic mode handling and process exit behavior.

## Scope

- Add doctor command routing in `ottoctl` command layer.
- Support mode selection:
  - fast (default)
  - deep (`--deep`)
- Define and enforce exit code contract (`0`, `1`, `2`).
- Return structured run summary from runtime doctor entrypoint to CLI adapter.
- Add command help text and usage examples.

## Non-Goals

- No probe implementation details beyond stubs.
- No terminal renderer or incident markdown writing.

## Dependencies

- None.

## Planned File Changes

- `packages/otto/bin/ottoctl` - add doctor command wiring.
- `packages/otto/src/cli/command.ts` - register doctor command contract.
- `packages/otto/src/cli/runner.ts` - map doctor verdict to exit code.
- `packages/otto/src/doctor/index.ts` - add initial doctor run entrypoint.
- `packages/otto/tests/cli/command.test.ts` - command parsing/dispatch tests.
- `packages/otto/tests/cli/runner.test.ts` - exit code mapping tests.

## Acceptance Criteria

- `ottoctl doctor` runs fast mode entrypoint.
- `ottoctl doctor --deep` runs deep mode entrypoint.
- Exit codes strictly match agreed contract.
- Invalid doctor flags return clear usage errors.

## Verification

- `pnpm -C packages/otto exec vitest run tests/cli/command.test.ts`
- `pnpm -C packages/otto exec vitest run tests/cli/runner.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable CLI-only increment with stubbed doctor backend.
