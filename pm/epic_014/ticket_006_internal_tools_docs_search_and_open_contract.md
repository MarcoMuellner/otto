# Ticket 006 - Internal Tools for Docs Search and Open

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Expose docs search/open capabilities to Otto via internal tools, including automatic auth handling for live docs endpoints.

## Scope

- Add internal tool contracts for docs search and page retrieval.
- Integrate tool backend with docs service APIs.
- Implement automatic token handling for live/authenticated docs endpoints.
- Return structured references (version, slug, section anchors) for explainability.

## Non-Goals

- No new user-facing `ottoctl docs` commands.
- No autonomous content editing through tools.
- No fallback to external web search engines.

## Dependencies

- `pm/epic_014/ticket_005_deployed_live_docs_views_with_token_auth.md`

## Planned File Changes

- internal tool registration and handlers in `packages/otto/src/**`.
- docs service API clients/contracts used by tools.
- tests for tool result shape, auth handling, and error mapping.
- operator/developer docs for tool usage expectations.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Otto can query docs by keyword and retrieve relevant pages.
- Otto can open specific docs pages/sections with version context.
- Tool calls to live docs endpoints authenticate automatically.
- Errors are explicit (`auth_required`, `not_found`, `version_mismatch`, etc.).

## Verification

- `pnpm -C packages/otto exec vitest run tests/**/docs*.test.ts` (or specific added tests)
- Integration test against running docs service in local environment.
- `pnpm -C packages/otto run check`

## Deployability

- Deployable tooling increment enabling Otto self-query against the operator docs platform.
