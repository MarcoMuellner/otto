# Ticket 004 - Cross-Surface List/Show/Cancel

## Status

- `state`: `done`

## Objective

Provide consistent background-task operations across Telegram, CLI chat, and Web chat using shared `job_id` identity.

## Scope

- Support intents/commands for:
  - `list background tasks`
  - `show task <job_id>`
  - `cancel task <job_id>`
- Filter operations to interactive background one-shot jobs in MVP.
- Implement cancel semantics via OpenCode session stop and deterministic terminal state update.
- Ensure new inbound messages remain independent while a task is running.

## Non-Goals

- Create/retry from CLI/Web.
- Pause/resume.
- Control of system-managed jobs.

## Dependencies

- `ticket_002_scheduler_execution_and_session_lifecycle.md`
- `ticket_003_telegram_lifecycle_and_milestone_tool.md`

## Acceptance Criteria

- Telegram, CLI chat, and Web chat can all list and inspect background tasks by same `job_id`.
- Cancel from any surface stops running session and marks task as cancelled.
- Cancel is idempotent and safe on terminal tasks.
- Command/task audit records show cross-surface operations.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/**/tasks*`
  - `pnpm -C packages/otto exec vitest run tests/**/external-api*`
  - `pnpm -C packages/otto exec vitest run tests/**/internal-api*`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable increment; full operator controls available from chat surfaces before UI tab work.
