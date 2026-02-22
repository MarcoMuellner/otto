# Ticket 001 - Runtime Model Catalog, Defaults, and Resolution

## Status

- `state`: `planned`

## Objective

Implement the runtime foundation for model management: catalog fetch/cache, per-flow defaults, per-job model field, and deterministic model resolution.

## Why

Without runtime-side model data and resolution rules, CLI/UI controls would be cosmetic and not enforceable during execution.

## Scope

- Add a runtime model catalog service in `packages/otto`:
  - fetch from OpenCode API/SDK
  - persist cache under `~/.otto/data`
  - expose freshness metadata
- Enforce startup behavior:
  - initial catalog fetch failure blocks Otto startup
- Add periodic refresh behavior:
  - refresh every 24h
  - keep previous cache on refresh failure and log warning
- Extend Otto config schema with flow defaults in `~/.config/otto/config.jsonc`:
  - `modelManagement.flowDefaults.interactiveAssistant`
  - `modelManagement.flowDefaults.scheduledTasks`
  - `modelManagement.flowDefaults.heartbeat`
  - `modelManagement.flowDefaults.watchdogFailures`
- Add job-level model override field:
  - SQLite migration adding nullable `jobs.model_ref`
  - repository types/queries updated (`modelRef: string | null`)
- Wire execution-time resolution in runtime paths with precedence:
  1. `job.modelRef`
  2. flow default
  3. OpenCode global default model
- Implement fallback handling:
  - when selected model is unavailable, fallback to OpenCode global default and log structured warning
- Ensure model/default changes are read live by runtime (no restart requirement).

## Interfaces and Contracts

- Config:
  - `~/.config/otto/config.jsonc` -> `modelManagement.flowDefaults.*`
- Cache:
  - `~/.otto/data/model-catalog-cache.json`
- Persistence:
  - `jobs.model_ref` nullable string
- Runtime contract:
  - model resolver returns `{ providerId, modelId, source }`

## Non-Goals

- External API endpoints.
- CLI commands.
- Web control-plane BFF/UI.

## Dependencies

- None.

## Engineering Principles Applied

- **TDD**: tests for startup fail behavior, refresh fallback, and resolution precedence first.
- **DRY**: one shared resolver for scheduler and assistant paths.
- **SOLID**: isolate catalog, config, and resolution concerns in dedicated runtime services.
- **KISS**: fixed four-flow defaults and one nullable job override field.

## Acceptance Criteria

- Otto startup fails with clear error if first catalog fetch from OpenCode fails.
- Otto periodic refresh keeps last known cache on failure and logs warning.
- Flow defaults are parsed/validated from config and available at runtime.
- Jobs persist/read `modelRef` correctly.
- Runtime uses correct precedence and fallback behavior during execution.

## Verification

- Unit tests for catalog service lifecycle and staleness behavior.
- Migration/repository tests for `jobs.model_ref`.
- Scheduler/runtime tests covering precedence and fallback.
- `pnpm -C packages/otto run check`

## Deployability

- Deployable runtime increment with no UI dependency; existing behavior preserved when no model defaults/overrides are configured.
