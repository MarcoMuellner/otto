# otto-control-plane

Web control-plane process for Otto, built with React Router 7 framework mode.

## Purpose

- Run independently from Otto runtime process.
- Expose browser-facing BFF endpoints under `/api/*`.
- Keep Otto external API token server-only.

## Runtime Topology

- Otto runtime process hosts the source-of-truth external API (`/external/*`).
- Control-plane process serves UI + BFF (`/api/*`) and calls Otto external API server-side.

## Current Routes

- UI routes:
  - `/` health/home shell
  - `/chat` operator chat surface backed by OpenCode sessions
  - `/system` runtime metadata, service matrix, and runtime restart control
  - `/settings` notification profile settings (non-secret runtime preferences)
  - `/jobs` jobs surface with tabs for scheduled jobs and interactive background tasks
  - `/jobs/:jobId` job detail + recent audit evidence + edit/cancel/run-now actions
- BFF routes:
  - `GET /api/health`
  - `GET /api/system/status`
  - `POST /api/system/restart`
  - `GET /api/models/catalog`
  - `POST /api/models/refresh`
  - `GET /api/models/defaults`
  - `PUT /api/models/defaults`
  - `GET /api/settings/notification-profile`
  - `PUT /api/settings/notification-profile`
  - `GET /api/jobs`
  - `POST /api/jobs`
  - `GET /api/jobs/:jobId`
  - `PATCH /api/jobs/:jobId`
  - `DELETE /api/jobs/:jobId`
  - `POST /api/jobs/:jobId/run-now`
  - `GET /api/jobs/:jobId/audit`
  - `GET /api/jobs/:jobId/runs`
  - `GET /api/jobs/:jobId/runs/:runId`
  - `GET /api/chat/threads`
  - `POST /api/chat/threads`
  - `GET /api/chat/threads/:threadId/messages`
  - `POST /api/chat/threads/:threadId/messages`

## Environment

- `OTTO_EXTERNAL_API_URL` (optional, default `http://127.0.0.1:4190`)
- `OTTO_EXTERNAL_API_TOKEN` (optional, highest precedence)
- `OTTO_EXTERNAL_API_TOKEN_FILE` (optional, defaults to `~/.otto/secrets/internal-api.token`)
- `OTTO_OPENCODE_API_URL` (optional, defaults from `~/.config/otto/config.jsonc` then `http://127.0.0.1:4096`)
- `OTTO_STATE_DB_PATH` (optional, defaults from Otto `ottoHome` config then `~/.otto/data/otto-state.db`)

When `OTTO_OPENCODE_API_URL` is unset but `OTTO_EXTERNAL_API_URL` is set, chat derives the OpenCode URL host from `OTTO_EXTERNAL_API_URL` and keeps the OpenCode port from Otto config/defaults.

Resolution order for these values:

1. local `packages/otto-control-plane/.env` (when present)
2. process environment
3. built-in fallbacks (runtime URL/token defaults + OpenCode/session-db defaults)

## Scripts

- `pnpm -C packages/otto-control-plane run dev`
- `pnpm -C packages/otto-control-plane run build`
- `pnpm -C packages/otto-control-plane run start`
- `pnpm -C packages/otto-control-plane run check`

## Deployable Service

- Release artifacts ship this package as a separate deployable process under `control-plane/`.
- `ottoctl start|restart|stop` manages the UI process independently from runtime.
- Default network bind is `0.0.0.0:4173` (override with `OTTO_CONTROL_PLANE_HOST` / `OTTO_CONTROL_PLANE_PORT`).

## Local Run

1. Start Otto runtime: `pnpm -C packages/otto run serve`
2. Start control plane: `pnpm -C packages/otto-control-plane run dev`
3. Open reported URL and verify health card updates via `/api/health`.

## Background Task Workflow

- Telegram/CLI/Web share the same canonical identifier: raw `job_id`.
- Jobs page `Background` tab filters to `interactive_background_oneshot` tasks and reuses existing list/detail UI.
- Cancelling a background task from web calls runtime background-cancel semantics (session stop + idempotent terminal handling), matching chat surfaces.
