# Ticket 007 - Approval Workflow for Write Actions

## Objective

Enforce explicit user approval for unsupervised write actions proposed by proactive runs.

## Why

You required a strict safety policy: autonomous intervals can propose writes, but cannot execute writes without your confirmation.

## Scope

- Define `approval_request` model (action type, payload, reason, expiry).
- Send approval prompts via Telegram with approve/reject buttons.
- Persist approval lifecycle in DB.
- Execute action only on explicit approval.
- Expire stale approvals safely.

## Non-Goals

- Rich action library breadth (focus on framework and a minimal action adapter).

## Dependencies

- `ticket_004`, `ticket_005`, `ticket_006`.

## Acceptance Criteria

- Unsupervised write actions are blocked until approval.
- Approved actions execute once and are auditable.
- Rejected/expired approvals never execute.

## Verification

- Unit tests for approval state machine.
- Integration tests for Telegram callback handling.

## Deployability

- Deployable and enforces core safety policy.
