# Ticket 009 - Proactive One-Shot Evaluation Engine

> Superseded by Epic 003 (`pm/epic_003/ticket_002_proactive_evaluator.md`).

## Objective

Implement the one-shot proactive engine that runs every 1-2 minutes, evaluates pending obligations, and sends actionable nudges.

## Why

This is the core of proactive behavior: detect what needs attention and communicate it at the right time.

## Scope

- Build one-shot proactive pipeline:
  - gather context (tasks, reminders, pending approvals, overdue items)
  - run OpenCode in the same chat session used for inbound messages
  - use OpenCode tool/plugin calls to enqueue outbound messages and approval requests
- Add priority tagging (`low`, `normal`, `high`).
- Respect quiet-hours rules for non-urgent notifications.

## Non-Goals

- Heartbeat summary generation (separate ticket).
- No post-hoc parsing of free-form assistant text into actions.

## Dependencies

- `ticket_005`, `ticket_006`, `ticket_007`, `ticket_008`.

## Acceptance Criteria

- One-shot runs can produce proactive DM messages.
- Priority and quiet-hour behavior are enforced.
- Writes are routed through approval workflow.
- One-shot action emission is tool-driven and idempotent (dedupe-capable), not parser-driven.

## Verification

- Evaluator unit tests with fixed fixtures.
- End-to-end test of one-shot run producing outbound queue entries.

## Deployability

- Deployable as first real proactive loop.
