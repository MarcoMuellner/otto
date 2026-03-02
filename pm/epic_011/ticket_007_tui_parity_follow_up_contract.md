# Ticket 007 - TUI Parity Follow-Up Contract

## Status

- `state`: `done`
- `implementation`: `done`

## Objective

Lock an implementation-ready contract for TUI interactive context injection parity after Telegram + Web shipped.

## Scope

- Record the current Telegram/Web parity baseline and exact semantics to preserve.
- Define deterministic TUI injection hook and adapter contract for the follow-up coding ticket.
- Provide implementation-ready file map, behavior checklist, and test plan.

## Non-Goals

- No TUI code changes in this ticket.
- No runtime schema changes.

## Dependencies

- `ticket_004_telegram_interactive_context_injection.md`
- `ticket_005_web_interactive_context_injection_parity.md`

## Planned File Changes

- `pm/epic_011/ticket_007_tui_parity_follow_up_contract.md` - update with concrete hook points and final implementation checklists.
- `pm/epic_011/epic_011.md` - mark parity completion status notes once contract is locked.

## Baseline (Already Shipped)

- Telegram injection hook: `packages/otto/src/telegram-worker/inbound.ts` in `handlePrompt` before `sessionGateway.promptSessionParts(...)`.
- Web injection hooks: `packages/otto-control-plane/app/server/chat-surface.server.ts` in `sendMessage(...)` and `sendMessageStream(...)` via `composeInteractivePromptTextWithContext(...)`.
- Shared parity semantics already in use:
  - key: `sourceSessionId`
  - default window: `20`, clamped to `5-200`
  - block header/footer:
    - `Recent non-interactive context:`
    - `Use this only as supporting context when it is relevant.`
  - degraded mode: context query failures do not fail the interactive turn
  - audit metadata includes injection status, event counts, and truncation

## TUI Parity Contract (Follow-Up Implementation)

### Target Surface

- TUI means OpenCode native terminal interactive chat (`surface=cli` prompt layering already exists).

### Deterministic Injection Hook

- Inject context at the last Otto-owned boundary before OpenCode session chat submission for CLI interactive turns.
- Contract requirement: injection happens before the final request body is sent to OpenCode session chat API, matching Telegram/Web timing.
- If context lookup fails, continue without injected context and mark degraded metadata.

### Adapter Contract

- Introduce one shared adapter that all interactive surfaces can use:
  - input:
    - `sourceSessionId: string`
    - `userInput: string | OpencodePromptPart[]`
    - `windowSize: number` (already clamped to `5-200`)
    - `listRecentBySourceSessionId(sourceSessionId, limit)`
  - output:
    - `injectedInput: string | OpencodePromptPart[] | null`
    - `status: "injected" | "none" | "degraded"`
    - `eventCount: number`
    - `injectedEventCount: number`
    - `truncated: boolean`
- Formatter output must stay byte-compatible with Telegram/Web block text semantics.

### Session and Isolation Rules

- Never query by transport key (chat id, thread id, etc.) directly at formatter layer; always resolve/forward canonical `sourceSessionId` first.
- Never inject context across sessions.

## Implementation-Ready File Map (Follow-Up Coding Ticket)

- `packages/otto/src/runtime/serve.ts`
  - wire CLI interactive path dependency for `interactiveContextEventsRepository` and profile window resolver where missing.
- `packages/otto/src/telegram-worker/inbound.ts`
  - refactor to consume shared adapter (no behavior change expected).
- `packages/otto-control-plane/app/server/chat-surface.server.ts`
  - refactor to consume shared adapter (no behavior change expected).
- `packages/otto/src/external-api/server.ts`
  - ensure CLI surface prompt resolution path remains explicit for audit/debug parity (`surface=cli`).
- `packages/otto/tests/telegram-worker/inbound.test.ts`
  - keep existing assertions passing after adapter extraction.
- `packages/otto-control-plane/tests/server/chat-surface.server.test.ts`
  - keep existing injected/non-injected/degraded assertions passing after adapter extraction.
- `packages/otto/tests/<tui-or-cli-interactive-path>.test.ts`
  - add new TUI-specific coverage at the concrete injection hook introduced in the follow-up ticket.

## Follow-Up Acceptance Checklist

- TUI interactive turns include recent non-interactive context with the same formatting and truncation semantics as Telegram/Web.
- Degraded-mode behavior matches Telegram/Web (continue prompt without injected context).
- Injection metadata is emitted with the same status/count fields.
- Existing Telegram/Web tests pass unchanged except for import/test-helper updates required by shared adapter extraction.
- New TUI parity tests cover injected, none, and degraded paths.

## Acceptance Criteria

- Clear TUI hook location(s) documented with exact file-level touch list.
- Parity behavior contract matches Telegram/Web semantics.
- Follow-up implementation ticket can be executed without additional discovery.

## Verification

- Planning artifact review against runtime/control-plane behavior implemented in tickets 004/005.

## Follow-Up Verification Commands (Coding Ticket)

- `pnpm -C packages/otto exec vitest run tests/telegram-worker/inbound.test.ts`
- `pnpm -C packages/otto-control-plane exec vitest run tests/server/chat-surface.server.test.ts`
- `pnpm -C packages/otto exec vitest run tests/<tui-or-cli-interactive-path>.test.ts`
- `pnpm run check`

## Deployability

- Implemented: shared formatter parity is wired for Telegram + Web, and TUI prompt injection is now active via OpenCode plugin hook.
