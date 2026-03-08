# Ticket 003 - Prompt Mapping Model and Route Resolution

## Status

- `state`: `done`

## Objective

Model prompt routing as data so runtime can resolve which layers/files apply per flow and media without hardcoding every mapping path.

## Scope

- Add mapping schema and loader for:
  - `~/.otto/system-prompts/mapping.jsonc`
  - `~/.otto/prompts/mapping.jsonc`
- Implement deterministic mapping resolution for route selection.
- Resolve routes for interactive, scheduled, background, and watchdog contexts.
- Keep watchdog route selection constrained to system mapping.
- Add unit tests for mapping merge and route resolution outcomes.

## Non-Goals

- SQLite provenance persistence.
- Runtime integration into Telegram/scheduler execution.
- Editing UX in CLI/web.

## Dependencies

- Ticket 001
- Ticket 002

## Acceptance Criteria

- Runtime can resolve route definitions from flow/media/job context using mapping files.
- Invalid user mapping entries are logged and skipped without crashing runtime.
- Watchdog route selection cannot be redirected by user mapping entries.
- Tests cover override precedence and fallback behavior.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/prompt-management/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable as config/domain behavior with no API contract changes yet.
