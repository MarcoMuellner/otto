# Ticket 007 - Scheduled Lane and Profile Scoping for Extensions

## Objective

Apply extension activation safely across interactive and scheduled contexts using existing OpenCode/task profile policy overlays.

## Why

Scheduled automation needs strict capability control; extensions must not broaden scheduled access implicitly.

## Scope

- Add scope model for extension enable targets:
  - interactive global
  - profile-scoped scheduled usage
- Integrate extension overlays into existing task profile resolution path.
- Preserve scheduled baseline minimal toolset unless profile explicitly allows extension features.
- Emit audit metadata showing effective extension set per scheduled run.

## Non-Goals

- New custom lane policy DSL.
- Dynamic policy mutation by scheduled jobs.

## Dependencies

- `ticket_006`.

## Acceptance Criteria

- Extension enabled for interactive does not automatically become available in scheduled lane.
- Profile-scoped extension enable works for selected scheduled tasks.
- Effective scope is auditable and deterministic.

## Verification

- Integration tests for lane/profile scope behavior.
- Scheduler execution tests with profile-scoped extension usage.

## Deployability

- Deployable safety gate for extension usage in scheduled automation.
