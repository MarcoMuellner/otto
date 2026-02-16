# Ticket 005 - Outbound Queue, Retry, and Dedupe

## Objective

Add a durable outbound delivery queue for proactive messages with retry/backoff and idempotent send behavior.

## Why

Telegram/API/network failures are expected. Proactive communication must not drop messages silently.

## Scope

- Add queue worker for `messages_out` processing.
- Implement retry policy (exponential backoff + max attempts).
- Add dedupe key support to prevent duplicate sends.
- Persist delivery outcomes and errors.

## Non-Goals

- No scheduler decision logic yet.

## Dependencies

- `ticket_003`, `ticket_004`.

## Acceptance Criteria

- Failed sends are retried automatically.
- Permanent failure state is visible in DB/logs.
- Duplicate enqueue with same dedupe key is ignored safely.

## Verification

- Unit tests for queue policy.
- Integration tests with simulated Telegram failures.

## Deployability

- Deployable and improves reliability of all outbound paths.
