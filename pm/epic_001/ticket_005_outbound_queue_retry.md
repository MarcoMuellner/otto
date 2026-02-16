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
- Add OpenCode-facing tool/plugin entrypoint for outbound enqueue (for example `queue_telegram_message`) so proactive prompts trigger queue writes directly.

## Non-Goals

- No scheduler decision logic yet.
- No direct Telegram sending from model/tool path (tool enqueues only; queue worker delivers).

## Dependencies

- `ticket_003`, `ticket_004`.

## Acceptance Criteria

- Failed sends are retried automatically.
- Permanent failure state is visible in DB/logs.
- Duplicate enqueue with same dedupe key is ignored safely.
- Tool-triggered enqueue path is idempotent and auditable.

## Verification

- Unit tests for queue policy.
- Integration tests with simulated Telegram failures.

## Deployability

- Deployable and improves reliability of all outbound paths.
