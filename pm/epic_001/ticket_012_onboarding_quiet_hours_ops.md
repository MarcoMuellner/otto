# Ticket 012 - Onboarding, User Profile, Quiet Hours, and Ops Hardening

## Objective

Finalize comms platform with onboarding/profile management, configurable quiet hours/timezone, and operational controls.

## Why

Proactive communication quality depends on user-specific timing and constraints. This ticket turns the system into a practical daily driver.

## Scope

- Add first-run onboarding flow for:
  - timezone
  - quiet hours
  - heartbeat windows
  - proactive style preference
- Persist profile in DB and expose editable settings command path.
- Enforce quiet-hours policy in scheduler/outbound pipeline.
- Add operational commands for worker status/last job run/queue depth.
- Finalize runbooks in README/docs for support and recovery.

## Non-Goals

- Multi-user onboarding.

## Dependencies

- `ticket_006`, `ticket_009`, `ticket_010`.

## Acceptance Criteria

- Fresh install can complete onboarding and immediately run with correct scheduling.
- Quiet-hours policy suppresses non-urgent messages as configured.
- Operator can inspect communication worker health quickly.

## Verification

- Onboarding flow tests.
- Quiet-hours scheduling tests with timezone variations.
- End-to-end smoke test for configured heartbeat + one-shot output.

## Deployability

- Deployable finalization ticket for Epic 001.
