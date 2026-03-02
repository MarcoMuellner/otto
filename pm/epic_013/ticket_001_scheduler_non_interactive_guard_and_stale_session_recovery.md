# Ticket 001 - Scheduler Non-Interactive Guard and Stale Session Recovery

## Status

- `state`: `planned`
- `category`: `bugfix`

## Objective

Fix scheduler runs so they cannot block on interactive tool prompts and can recover automatically from dead/stale bound sessions.

## Scope

- Enforce non-interactive tool policy for scheduled/background execution paths.
- Prevent or strip `question` tool usage in scheduler-triggered prompt execution.
- Detect stale/unusable bound session failures and rotate session binding automatically.
- Persist recovery-safe run metadata and log context for root-cause visibility.
- Add regression tests for deadlock prevention and binding auto-recovery behavior.

## Non-Goals

- No change to interactive Telegram/Web/TUI behavior.
- No broad retry strategy redesign for all error classes.
- No new operator commands; behavior should self-heal in normal runs.

## Dependencies

- `pm/epic_009/ticket_002_scheduler_execution_and_session_lifecycle.md`
- `pm/epic_011/ticket_007_tui_parity_follow_up_contract.md`

## Planned File Changes

- `packages/otto/src/scheduler/executor.ts` - enforce non-interactive scheduler tool constraints and stale session recovery flow.
- `packages/otto/src/telegram-worker/opencode.ts` - align prompt/session gateway contract if scheduler-safe flags are added there.
- `packages/otto/src/runtime/persistence/session-bindings-repository.ts` - add helper(s) needed for safe binding reset semantics.
- `packages/otto/tests/scheduler/executor.test.ts` - add regression coverage for question-tool deadlock prevention and stale-session rebind.
- `pm/epic_013/epic_013.md` - mark progress when implemented.

## Acceptance Criteria

- Scheduler execution never waits on `question` tool interaction.
- When a bound session is stale/unrecoverable, next run rotates to a fresh session automatically.
- Recovery path is logged with job id, prior session id, new session id, and error context.
- Regression tests fail on previous deadlock behavior and pass with the fix.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/executor.test.ts`
- `pnpm -C packages/otto run check`
- `pnpm run check`

## Deployability

- Deployable bugfix slice that removes a production deadlock class for scheduled jobs.
