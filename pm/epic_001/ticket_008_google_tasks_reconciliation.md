# Ticket 008 - Google Tasks Adapter and Completion Reconciliation

> Superseded by Epic 003 (`pm/epic_003/ticket_003_external_reconciliation.md`).

## Objective

Integrate Google Tasks state observation to reconcile whether proactive reminders are already completed outside Telegram.

## Why

You want Otto to stop nagging when tasks are completed in external channels, not only by chat reply.

## Scope

- Add Google Tasks read adapter.
- Persist observed task states and timestamps.
- Map proactive items to external task IDs.
- Mark reminders resolved when external task completion is detected.
- Keep reconciliation updates linked to the single DM/session context so follow-up messaging remains coherent.

## Non-Goals

- Full task authoring automation breadth in this ticket.

## Dependencies

- `ticket_003`, `ticket_007`.

## Acceptance Criteria

- Otto can observe Google Tasks completion status.
- Proactive reminders tied to completed tasks are auto-resolved.
- Reconciliation is idempotent and logged.

## Verification

- Adapter unit tests.
- Integration tests with mocked Google Tasks responses.

## Deployability

- Deployable; adds external completion intelligence without unsafe writes.
