# Ticket 002 - Control-Plane Process and BFF Foundation

## Status

- `state`: `planned`

## Objective

Introduce a separate control-plane process using React + React Router 7 framework mode, with backend-for-frontend routing that keeps Otto API tokens server-only.

## Why

UI availability must not depend on runtime restart cycles, and frontend code must never hold external API secrets.

## Scope

- Create new package for control plane (web process).
- Set up React Router 7 framework mode with server and client entries.
- Add BFF routes in control-plane backend that call Otto external API.
- Implement server-only env/config loader for external API URL and token source.
- Add initial page shell aligned with Paper Void design language.
- Add a health status card proving end-to-end BFF-to-runtime flow.

## Interfaces and Contracts

- Control-plane backend endpoints:
  - `GET /api/health`
  - `GET /api/jobs` (initial pass-through for later pages)
- Upstream runtime dependency:
  - `GET /external/health`

## Non-Goals

- Full jobs UX.
- Jobs mutation flows.
- System/settings/chat pages.

## Dependencies

- `ticket_001`

## Engineering Principles Applied

- **TDD**: test server-only config loading and BFF endpoint behavior before UI wiring.
- **DRY**: centralize Otto API client in one backend module.
- **SOLID**: keep React presentation, BFF adapters, and Otto API client responsibilities separate.
- **KISS**: minimal app shell and smallest useful route set.

## Acceptance Criteria

- Control-plane runs as independent process from Otto runtime.
- Browser only calls control-plane endpoints; never calls `/external/*` directly.
- Otto token is never serialized to browser payloads or client bundle.
- Health card displays runtime status through BFF chain.
- Run/build docs updated for dual-process startup.

## Verification

- Unit tests for config boundary and Otto API client.
- Integration test for `/api/health` proxy behavior.
- Build-time check ensuring no token references in client bundle entrypoints.
- `pnpm run typecheck`
- `pnpm run test`

## Deployability

- Deployable UI foundation with operational value (runtime health visibility).
