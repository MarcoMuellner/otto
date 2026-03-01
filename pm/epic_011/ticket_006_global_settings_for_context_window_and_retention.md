# Ticket 006 - Global Settings for Context Window and Retention

## Status

- `state`: `planned`

## Objective

Expose global configuration for interactive context injection and retention through existing settings flows (ottoctl assistant tools + web settings).

## Scope

- Add global settings fields:
  - interactive context window size (default 20)
  - context retention cap (default 100)
- Validate both in range `5-200`.
- Extend internal API, external API, control-plane contracts, and settings UI.
- Extend existing `get_notification_policy`/`set_notification_policy` tool contracts.

## Non-Goals

- New top-level ottoctl command.
- Per-surface or per-lane config variants.

## Dependencies

- `ticket_001_context_event_persistence_and_repository.md`
- `ticket_004_telegram_interactive_context_injection.md`
- `ticket_005_web_interactive_context_injection_parity.md`

## Planned File Changes

- `packages/otto/src/api-services/settings-notification-profile.ts` - add new fields and validation.
- `packages/otto/src/persistence/migrations.ts` - add user_profile column(s) for new settings.
- `packages/otto/src/persistence/repositories.ts` - persist/read new settings fields.
- `packages/otto/src/internal-api/server.ts` - include fields in notification-profile get/set schemas.
- `packages/otto/src/external-api/server.ts` - expose fields in notification profile contract.
- `packages/otto/src/assets/.opencode/tools/get_notification_policy.ts` - include fields in output contract expectations.
- `packages/otto/src/assets/.opencode/tools/set_notification_policy.ts` - accept/update new fields.
- `packages/otto-control-plane/app/features/settings/contracts.ts` - extend zod contracts.
- `packages/otto-control-plane/app/routes/settings.tsx` - add/edit form controls for both values.
- `packages/otto-control-plane/app/server/otto-external-api.server.ts` - passthrough new settings fields.
- `packages/otto/tests/internal-api/server.test.ts` - validation and roundtrip tests.
- `packages/otto/tests/external-api/server.test.ts` - contract tests for fields.
- `packages/otto-control-plane/tests/routes/api.settings.notification-profile.test.ts` - route tests.

## Acceptance Criteria

- Settings are readable/writable through existing settings API and web UI.
- Values outside `5-200` are rejected with clear validation errors.
- Defaults apply for existing installs without manual migration actions.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/internal-api/server.test.ts tests/external-api/server.test.ts`
  - `pnpm -C packages/otto-control-plane exec vitest run tests/routes/api.settings.notification-profile.test.ts`
- Cross-package quality gate:
  - `pnpm run check`

## Deployability

- Deployable contract/config increment using existing settings surfaces.
