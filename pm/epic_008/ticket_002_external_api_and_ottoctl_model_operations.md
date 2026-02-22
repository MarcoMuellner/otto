# Ticket 002 - External API and ottoctl Model Operations

## Status

- `state`: `planned`

## Objective

Expose runtime model management through authenticated external API and `ottoctl` commands.

## Why

Marco needs direct operator controls to inspect/refresh catalog, change flow defaults, and set per-job model selection from CLI.

## Scope

- Add runtime external API endpoints:
  - `GET /external/models/catalog`
  - `POST /external/models/refresh`
  - `GET /external/models/defaults`
  - `PUT /external/models/defaults`
- Extend external job DTOs/mutations with nullable `modelRef`.
- Add `ottoctl` commands:
  - `ottoctl model list`
  - `ottoctl model refresh`
  - `ottoctl model defaults show`
  - `ottoctl model defaults set <flow> <provider/model>`
  - `ottoctl task set-model <task-id> <provider/model|inherit>`
- Validate command and API payloads with shared zod contracts where possible.
- Add audit entries/logs for refresh and default updates.

## Interfaces and Contracts

- Runtime external APIs:
  - `GET /external/models/catalog` -> `{ models: string[], updatedAt: number | null, source: string }`
  - `POST /external/models/refresh` -> `{ status: "ok", updatedAt: number, count: number }`
  - `GET /external/models/defaults` -> `{ flowDefaults: { interactiveAssistant, scheduledTasks, heartbeat, watchdogFailures } }`
  - `PUT /external/models/defaults` -> same shape as read response
- Job mutation contract:
  - `POST/PATCH /external/jobs*` accept `modelRef?: string | null`
  - `null` means inherit scheduled flow default

## Non-Goals

- Control-plane web UI components.
- New auth system or token handling changes.

## Dependencies

- `ticket_001`

## Engineering Principles Applied

- **TDD**: endpoint and CLI contract tests before implementation.
- **DRY**: reuse runtime services from ticket_001; no duplicated model logic in CLI.
- **SOLID**: keep transport-layer parsing/mapping separate from domain service.
- **KISS**: expose only required endpoints and fixed commands.

## Acceptance Criteria

- CLI can list and refresh catalog.
- CLI can show/set flow defaults.
- CLI can set job model to explicit value or inherit.
- External API remains bearer-token protected and returns no secrets.
- Invalid flow/model inputs return clear validation errors.

## Verification

- Runtime external API tests for auth, validation, success, and failure paths.
- CLI tests for all new commands.
- Manual smoke with running Otto:
  - run all five commands
  - verify changed defaults and job `modelRef` via existing jobs read endpoints
- `pnpm -C packages/otto run check`

## Deployability

- Deployable operator-control increment for runtime model management via CLI and API.
