# Ticket 002 - Single-User DM Security Gate

## Objective

Enforce strict Telegram access control so only one allowed user in direct messages can interact with Otto.

## Why

This is a personal assistant system. Security must reject non-allowlisted users/chats before any business logic executes.

## Scope

- Add required config fields: `telegram.botToken`, `telegram.allowedUserId`.
- Validate all incoming updates against allowlist.
- Reject non-authorized messages with minimal/no information leakage.
- Add auditable security logs for denied events.

## Non-Goals

- Multi-user policy.
- Group/channel permissions.

## Dependencies

- `ticket_001`.

## Acceptance Criteria

- Unauthorized updates are ignored or denied safely.
- Authorized user DM path proceeds.
- Security checks happen before prompt/scheduler processing.

## Verification

- Unit tests for authorization matrix.
- Integration smoke tests with mocked Telegram update payloads.

## Deployability

- Deployable immediately and reduces risk.
