# Ticket 003 - Telegram Lifecycle Messaging and Milestone Tool

## Status

- `state`: `planned`

## Objective

Deliver natural Telegram push updates for background runs and allow in-run phase updates through a throttled internal milestone tool.

## Scope

- Emit handler-owned Telegram messages for:
  - run started
  - run final success
  - run final failure
- Add internal tool for LLM-driven milestone updates (free text).
- Resolve task context from active run/session mapping (or explicit id fallback).
- Add per-task milestone throttling (minimum interval).

## Non-Goals

- Rich progress percentage model.
- Telegram menu command UX.
- Push notifications to CLI/Web.

## Dependencies

- `ticket_002_scheduler_execution_and_session_lifecycle.md`

## Acceptance Criteria

- Start and terminal messages are sent to Telegram for background runs.
- Milestone tool can enqueue natural-language phase updates during a run.
- Milestone throttling suppresses bursts as configured.
- Message/audit traces include task/run identity for debugging.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/**/telegram*`
  - `pnpm -C packages/otto exec vitest run tests/**/internal-api*`
  - `pnpm -C packages/otto exec vitest run tests/**/scheduler*`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable increment; Telegram-only push channel behavior is available without UI changes.
