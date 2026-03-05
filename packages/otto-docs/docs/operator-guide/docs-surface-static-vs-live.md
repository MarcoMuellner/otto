---
id: docs-surface-static-vs-live
title: Static Docs vs Live Docs Surface
description: Decide when to use public static docs and when to use deployed live runtime views.
---

Otto docs ship in two modes with different risk boundaries.

## Public Static Docs

- Intended for broad, read-only documentation access
- No live runtime internals
- No token-required runtime data fetch

Use static docs for:

- Command syntax and behavior reference
- Stable contracts and API semantics
- Standard runbook procedures

## Deployed Live Docs

- Includes `/live` route when live docs are enabled in deployed docs build
- Uses bearer token auth
- Reads current runtime self-awareness snapshot from external API via docs
  service proxy (`/api/live/self-awareness`)

Use live docs for:

- Current process status and runtime health details
- Active limits and risk visibility
- Investigating current incidents

## Auth Boundary

- Live docs require `Authorization: Bearer <token>`
- Missing token returns `auth_required`
- Upstream connectivity failures return `upstream_unreachable`

## Operator Rule of Thumb

- Start with static docs for procedure and contracts
- Switch to live docs when you need current runtime truth for incident handling
