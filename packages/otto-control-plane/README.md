# otto-control-plane

Web control-plane process for Otto, built with React Router 7 framework mode.

## Purpose

- Run independently from Otto runtime process.
- Expose browser-facing BFF endpoints under `/api/*`.
- Keep Otto external API token server-only.

## Runtime Topology

- Otto runtime process hosts the source-of-truth external API (`/external/*`).
- Control-plane process serves UI + BFF (`/api/*`) and calls Otto external API server-side.

## Environment

- `OTTO_EXTERNAL_API_URL` (optional, default `http://127.0.0.1:4190`)
- `OTTO_EXTERNAL_API_TOKEN` (optional, highest precedence)
- `OTTO_EXTERNAL_API_TOKEN_FILE` (optional, defaults to `~/.otto/secrets/internal-api.token`)

## Scripts

- `pnpm -C packages/otto-control-plane run dev`
- `pnpm -C packages/otto-control-plane run build`
- `pnpm -C packages/otto-control-plane run start`
- `pnpm -C packages/otto-control-plane run check`

## Local Run

1. Start Otto runtime: `pnpm -C packages/otto run serve`
2. Start control plane: `pnpm -C packages/otto-control-plane run dev`
3. Open reported URL and verify health card updates via `/api/health`.
