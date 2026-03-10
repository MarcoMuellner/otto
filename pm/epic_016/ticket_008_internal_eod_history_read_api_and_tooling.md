# Ticket 008 - Internal EOD History Read API and Tooling

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Expose EOD learning history through internal API and OpenCode tools so Otto can reference prior learnings directly from SQLite.

## Scope

- Add internal API endpoint(s) to list and inspect EOD learning runs/items/actions.
- Add `.opencode` tool wrappers for EOD history lookup.
- Add request/response schemas and OpenAPI updates.
- Add endpoint/tool tests including auth and filtering behavior.

## Non-Goals

- No control-plane analytics UI.
- No write/update API for historical EOD records.

## Dependencies

- `ticket_001` (persistence layer available).
- `ticket_005` (runtime producing EOD artifacts).

## Planned File Changes

- `packages/otto/src/internal-api/server.ts` - EOD history route(s).
- `packages/otto/src/assets/.opencode/tools/list_eod_learning.ts` - list tool.
- `packages/otto/src/assets/.opencode/tools/show_eod_learning_run.ts` - detail tool.
- `packages/otto/tests/internal-api/server.test.ts` - route coverage.
- `packages/otto/docs/openapi/internal.v1.json` - generated API update.
- `packages/otto/docs/openapi/README.md` - endpoint docs update if needed.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- Internal API returns recent EOD runs and detailed run view with items/actions.
- Tool wrappers can fetch EOD history using internal API token flow.
- Route is covered by existing internal auth guard and audited like other tool endpoints.
- OpenAPI artifacts are regenerated and checked in.

## Verification

- `pnpm -C packages/otto exec vitest run tests/internal-api/server.test.ts -t "eod"`
- `pnpm -C packages/otto run docs:openapi:generate`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable introspection increment; bot and operator can inspect nightly learnings without direct DB access.
