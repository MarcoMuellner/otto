# Ticket 007 - ottoctl Prompt Picker and Editor

## Status

- `state`: `planned`

## Objective

Provide a CLI workflow to select prompt files with arrow keys and open them in the default terminal editor.

## Scope

- Add `ottoctl` prompt command for listing/selecting prompt files interactively.
- Support arrow-key navigation for file selection.
- Open selected file via `$EDITOR` (with sensible fallback behavior).
- Distinguish system-owned vs user-owned prompt files in the picker.
- Add CLI tests and help/docs updates.

## Non-Goals

- Rich in-terminal Markdown editing.
- Prompt linting/quality scoring.
- Web UI changes.

## Dependencies

- Ticket 002
- Ticket 003

## Acceptance Criteria

- Operator can launch picker, navigate with arrows, and open selected prompt file.
- User-owned files are editable directly.
- System-owned files are clearly labeled (and behavior is explicit if editing is allowed/blocked).
- Command exits cleanly with actionable errors when editor is unavailable.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/cli/*.test.ts`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable as new CLI surface with no schema migration.
