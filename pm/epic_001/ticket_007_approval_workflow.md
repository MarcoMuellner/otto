# Ticket 007 - Approval Workflow for Write Actions

> Superseded by Epic 003 (`pm/epic_003/ticket_001_approval_workflow.md`).

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
- Keep approval prompts and user responses in the same DM/session chain to preserve conversational continuity.

## Non-Goals

- Rich action library breadth (focus on framework and a minimal action adapter).

## Dependencies

- `ticket_004`, `ticket_005`, `ticket_006`.

## Acceptance Criteria

- Unsupervised write actions are blocked until approval.
- Approved actions execute once and are auditable.
- Rejected/expired approvals never execute.
- Approval interactions remain understandable without thread-emulation UX primitives.

## Verification

- Unit tests for approval state machine.
- Integration tests for Telegram callback handling.

## Deployability

- Deployable and enforces core safety policy.
