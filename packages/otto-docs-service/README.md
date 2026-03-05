# otto-docs-service

Dedicated runtime process that serves Otto docs artifacts from release bundles.

## Runtime Environment

- `OTTO_DOCS_HOST` (default `0.0.0.0`)
- `OTTO_DOCS_PORT` (default `4174`)
- `OTTO_DOCS_BASE_PATH` (default `/`)
- `OTTO_DOCS_SITE_DIR` (optional override for docs static asset directory)
- `OTTO_EXTERNAL_API_URL` (optional explicit external API base URL used by live docs proxy)
- fallback for live docs proxy: `OTTO_EXTERNAL_API_HOST` + `OTTO_EXTERNAL_API_PORT`

## Live Docs Proxy

- `GET /api/live/self-awareness` forwards to `${OTTO_EXTERNAL_API_URL}/external/self-awareness/live`
  (or host/port fallback).
- Requests require an `Authorization: Bearer <token>` header and never persist the token server-side.
