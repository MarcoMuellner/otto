# Ticket 007 - TUI Parity Follow-Up Contract

## Status

- `state`: `planned`

## Objective

Define the integration contract for TUI interactive context injection parity after Telegram + Web ship.

## Scope

- Trace TUI prompt entrypoints and identify deterministic injection hook.
- Define adapter contract to reuse same context formatter/query behavior.
- Add implementation-ready file map and test plan for follow-up coding ticket.

## Non-Goals

- No TUI code changes in this ticket.
- No runtime schema changes.

## Dependencies

- `ticket_004_telegram_interactive_context_injection.md`
- `ticket_005_web_interactive_context_injection_parity.md`

## Planned File Changes

- `pm/epic_011/ticket_007_tui_parity_follow_up_contract.md` - update with concrete hook points and final implementation checklists.
- `pm/epic_011/epic_011.md` - mark parity completion status notes once contract is locked.

## Acceptance Criteria

- Clear TUI hook location(s) documented with exact file-level touch list.
- Parity behavior contract matches Telegram/Web semantics.
- Follow-up implementation ticket can be executed without additional discovery.

## Verification

- Planning artifact review against runtime/control-plane behavior implemented in tickets 004/005.

## Deployability

- Planning-only increment; no runtime behavior change.
