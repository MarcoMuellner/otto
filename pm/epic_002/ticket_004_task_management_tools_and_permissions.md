# Ticket 004 - Task Management Tools and Permission Lanes

## Objective

Add task management tools (create/update/delete/list) with strict execution context policy.

## Why

You want natural interactive task management while preventing scheduled automation from mutating the task registry.

## Scope

- Add task tools: `create_task`, `update_task`, `delete_task`, `list_tasks`.
- Add explicit execution context lane (`interactive` vs `scheduled`).
- Allow task mutation only in interactive lane (Telegram inbound/direct OpenCode).
- Deny task mutation in scheduled one-shot lane; permit read-only list/inspect.

## Non-Goals

- Task business execution logic.
- Approval workflow.

## Dependencies

- `ticket_002`, `ticket_003`

## Acceptance Criteria

- Interactive turns can create/update/delete tasks.
- Scheduled one-shot turns cannot create/update/delete tasks.
- Denied writes are logged and auditable.

## Verification

- Unit tests for permission gate decisions.
- Integration tests for tool invocation by lane.

## Deployability

- Deployable safety gate for task registry integrity.
