# Ticket 005 - Task Execution Engine and Failure Watchdog

## Objective

Execute due tasks through OpenCode with structured run outputs and add automatic failure watchdog notification.

## Why

The scheduler must produce actionable outcomes and notify when execution health degrades.

## Scope

- Execute claimed tasks through OpenCode with profile-resolved skills.
- Require structured execution result (`status`, `summary`, `errors`) per run.
- Persist run result in task history.
- Add standard watchdog task to summarize recent failures and notify via Telegram queue tool.

## Non-Goals

- Rich business action adapters.
- Heartbeat content generation.

## Dependencies

- `ticket_001`, `ticket_002`, `ticket_003`, `ticket_004`

## Acceptance Criteria

- Due tasks execute and persist structured run outcomes.
- Failed runs are discoverable by assistant and operator.
- Watchdog emits dedupe-safe failure alerts.

## Verification

- End-to-end test: due task -> run record -> watchdog alert.
- Unit tests for structured result parsing and failure classification.

## Deployability

- Deployable scheduler execution slice with guarded, observable behavior.
