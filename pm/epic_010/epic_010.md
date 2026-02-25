# Epic 010 - Prompt Management Hierarchy and Provenance

## Status

- `id`: `epic_010`
- `type`: epic ticket
- `state`: `planned`
- `goal`: introduce a dedicated prompt-management system with layered resolution, user-safe customization, and explicit runtime provenance across interactive and job execution flows.

## Why

Prompt ownership is currently unclear and split across runtime paths. Marco needs a clean hierarchy that makes it obvious which prompt is active for each flow/job, keeps user customization safe across updates, and preserves watchdog prompt visibility without allowing user overrides.

## Decisions Locked In

- Prompt management is separate from tools/permissions configuration.
- Layer order is fixed as: `core-persona -> surface -> media -> task-profile(optional)`.
- `role-or-job-type` layer is removed for MVP.
- `task-profile` is job-specific and configured per job only.
- Media mapping is: Telegram interactive -> `chatapps`, control-plane web -> `web`, CLI -> `cli`, scheduled/background jobs -> job media (default `cli`).
- `~/.otto/system-prompts/` is shipped and always overwritten on install/update.
- `~/.otto/prompts/` is user-owned and never overwritten.
- Prompt routing is modeled as config data (system mapping + user mapping override).
- Prompt files are Markdown (`.md`) only.
- Watchdog uses a system-only prompt file and remains non-user-configurable.
- Invalid/missing user prompt files log errors and are treated as empty layers.
- Prompt provenance is persisted in SQLite and exposed through runtime read surfaces.

## Success Criteria

- Runtime can deterministically resolve prompt chains for interactive, scheduled, background, and watchdog flows.
- Users can edit prompt layers from files without losing changes during setup/update.
- Every run/session can be inspected to see which prompt layers/files were applied.
- Watchdog prompt behavior is explicit and visible while staying system-owned.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Prompt-management domain and composition contracts.
2. `ticket_002`: System/user prompt directory deployment semantics.
3. `ticket_003`: Mapping model and effective routing resolution.
4. `ticket_004`: Interactive flow integration with surface/media layering.
5. `ticket_005`: Scheduler/background/watchdog prompt resolution integration.
6. `ticket_006`: SQLite prompt provenance persistence and API exposure.
7. `ticket_007`: `ottoctl` prompt picker/editor UX.
8. `ticket_008`: Control-plane prompt management UI/BFF.

## Out of Scope

- Tools/permissions refactor.
- AI-generated prompt authoring.
- Memory plugin architecture redesign.
- Multi-tenant auth or RBAC changes.
- External sync/versioning for prompt files.
