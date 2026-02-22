# Epic 008 - Runtime Model Management

## Status

- `id`: `epic_008`
- `type`: epic ticket
- `state`: `planned`
- `goal`: deliver a small, runtime-first model management surface so Marco can see available OpenCode models and switch defaults per flow, with optional per-job override.

## Why

Model selection is currently global and opaque. Otto needs a simple way to expose available models and switch model defaults by runtime flow without restarts.

## Decisions Locked In

- Source of truth for available models is OpenCode API/SDK (not static file parsing).
- Otto fetches model catalog at startup; startup fails if initial fetch fails.
- Otto refreshes catalog automatically every 24h; failed periodic refresh keeps last cache and logs warning.
- Manual refresh must be available in both `ottoctl` and web control plane.
- Flow defaults in MVP:
  - `interactiveAssistant`
  - `scheduledTasks`
  - `heartbeat`
  - `watchdogFailures`
- Per-job model selection is direct on job record (`modelRef`) with two states:
  - explicit model
  - inherit scheduled flow default (`null`)
- Resolution precedence for scheduled execution:
  1. job `modelRef`
  2. flow default
  3. global OpenCode default model
- If configured model is unavailable, runtime falls back to global OpenCode default and logs warning.
- Changes to defaults or job model apply immediately (no restart).
- Telegram/transcription model settings are out of scope.

## Success Criteria

- Operator can list available models and refresh catalog from CLI and web.
- Operator can set and inspect flow defaults for the four MVP flows.
- Operator can set per-job model override (or inherit) from CLI and web job forms.
- Runtime consistently resolves model via locked precedence and fallback behavior.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Runtime model catalog, config defaults, resolver, and job schema support.
2. `ticket_002`: External API + `ottoctl` model management commands.
3. `ticket_003`: Control-plane BFF/UI for global defaults and per-job model selection.

## Out of Scope for Epic 008

- Provider credential setup UX.
- Multi-user preferences or RBAC.
- Non-runtime model domains (voice/transcription).
