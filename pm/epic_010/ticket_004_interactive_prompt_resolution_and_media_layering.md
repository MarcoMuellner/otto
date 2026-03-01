# Ticket 004 - Interactive Prompt Resolution and Media Layering

## Status

- `state`: `planned`

## Objective

Apply the new prompt hierarchy to interactive assistant flows so Telegram/web/CLI interactions use explicit `core + surface + media` prompt chains.

## Scope

- Integrate prompt resolution into interactive request paths before OpenCode session chat calls.
- Resolve media layer by surface:
  - Telegram -> `chatapps`
  - control-plane web -> `web`
  - CLI -> `cli`
- Pass resolved system prompt explicitly through session gateway options.
- Add integration tests for interactive prompt injection and non-crashing fallback behavior.

## Non-Goals

- Job-specific `task-profile` application in interactive turns.
- Scheduler and watchdog prompt path changes.
- Prompt provenance persistence schema updates.

## Dependencies

- Ticket 001
- Ticket 003

## Acceptance Criteria

- Interactive turns resolve prompt chain from mapping/layers and send it as system prompt.
- Media mapping is correctly applied per interactive surface.
- Invalid/missing user prompt layers log error and are treated as empty.
- Existing interactive behavior remains functionally stable outside prompt text changes.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/telegram-worker/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable behind normal runtime restart; no DB migration required.
