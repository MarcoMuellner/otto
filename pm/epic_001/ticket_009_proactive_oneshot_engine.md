# Ticket 009 - Proactive One-Shot Evaluation Engine

## Objective

Implement the one-shot proactive engine that runs every 1-2 minutes, evaluates pending obligations, and sends actionable nudges.

## Why

This is the core of proactive behavior: detect what needs attention and communicate it at the right time.

## Scope

- Build one-shot evaluator pipeline:
  - gather context (tasks, reminders, pending approvals, overdue items)
  - ask OpenCode for prioritized outcomes (structured output)
  - enqueue outbound messages and approval requests as needed
- Add priority tagging (`low`, `normal`, `high`).
- Respect quiet-hours rules for non-urgent notifications.

## Non-Goals

- Heartbeat summary generation (separate ticket).

## Dependencies

- `ticket_005`, `ticket_006`, `ticket_007`, `ticket_008`.

## Acceptance Criteria

- One-shot runs can produce proactive DM messages.
- Priority and quiet-hour behavior are enforced.
- Writes are routed through approval workflow.

## Verification

- Evaluator unit tests with fixed fixtures.
- End-to-end test of one-shot run producing outbound queue entries.

## Deployability

- Deployable as first real proactive loop.
