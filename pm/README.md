# Product Management

This directory stores deployable epics and tickets.

## Current Epic Layout

- `epic_001`: Telegram runtime foundation (completed through ticket_005).
- `epic_002`: Scheduler and task orchestration engine (next execution epic).
- `epic_003`: Proactive actions and approval-governed automation.
- `epic_004`: Heartbeats, onboarding, and operations hardening.
- `epic_005`: Voice and multimodal intake.

## Structure

- `epic_XXX/epic_XXX.md`: overarching epic ticket
- `epic_XXX/ticket_YYY_*.md`: implementation tickets in execution order

## Ticket Rules

- Each ticket must be independently deployable.
- Each ticket must include scope, acceptance criteria, and verification steps.
- Each ticket must define explicit non-goals to avoid hidden scope.
- Tickets are spec-driven: implementation follows these documents, not ad-hoc decisions.
