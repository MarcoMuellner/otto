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
  - `/system` runtime metadata, service matrix, and runtime restart control
  - `/settings` notification profile settings (non-secret runtime preferences)
  - `/jobs` scheduled jobs list with system/operator grouping and create form
  - `/jobs/:jobId` job detail + recent audit evidence + edit/cancel/run-now actions
- BFF routes:
  - `GET /api/health`
  - `GET /api/system/status`
  - `POST /api/system/restart`
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

## Environment

- `OTTO_EXTERNAL_API_URL` (optional, default `http://127.0.0.1:4190`)
- `OTTO_EXTERNAL_API_TOKEN` (optional, highest precedence)
- `OTTO_EXTERNAL_API_TOKEN_FILE` (optional, defaults to `~/.otto/secrets/internal-api.token`)

Resolution order for these values:

1. local `packages/otto-control-plane/.env` (when present)
2. process environment
3. built-in fallbacks (URL default + token file default)

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
