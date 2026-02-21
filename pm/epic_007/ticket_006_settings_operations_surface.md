# Ticket 006 - Settings Operations Surface

## Status

- `state`: `planned`

## Objective

Expose practical operator settings management in UI, starting with notification profile and safe runtime settings updates.

## Why

System operations are incomplete without configurable behavior in the same control plane.

## Scope

- Add external API settings read/write contracts for notification profile.
- Optionally add a minimal safe subset of runtime configuration fields (non-secret, non-destructive).
- Implement Settings page forms with validation and save feedback.
- Add audit metadata for settings changes.
- Keep secret-bearing environment variables out of UI scope.

## Interfaces and Contracts

- Runtime external endpoints:
  - `GET /external/settings/notification-profile`
  - `PUT /external/settings/notification-profile`
  - optional safe settings endpoints as explicitly defined in implementation
- Control-plane endpoints:
  - `GET /api/settings/notification-profile`
  - `PUT /api/settings/notification-profile`

## Non-Goals

- Generic env var editor.
- Secret management UI.
- Prompt/model/workflow authoring.

## Dependencies

- `ticket_001`
- `ticket_002`
- `ticket_005`

## Engineering Principles Applied

- **TDD**: validation and persistence tests first; form error-state tests included.
- **DRY**: shared schemas between API boundary and service layer where possible.
- **SOLID**: separate settings domain service from transport/UI concerns.
- **KISS**: only editable settings with clear operational value and low risk.

## Acceptance Criteria

- Operator can view and update notification profile in UI.
- Invalid settings are rejected with clear validation feedback.
- Settings updates are persisted and auditable.
- No secrets are returned in settings responses.
- Docs updated with editable settings list and safety boundaries.

## Verification

- Endpoint tests for valid/invalid payload paths.
- UI tests for form validation, submit, and persistence feedback.
- Manual smoke: update settings and confirm read-back consistency.
- `pnpm run check`

## Deployability

- Deployable system-ops slice meeting MVP priority #2 (part 2).
