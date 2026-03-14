---
name: radarr-sonarr-mcp-ops
description: Use Radarr and Sonarr MCP tools to browse and filter movie and series libraries.
---

## When to use

- Use this skill when the user asks for movie or TV library lookups backed by Radarr/Sonarr.
- Prefer read/query operations over assumptions about watch status or download status.

## Workflow

1. Use `get_available_movies` or `get_available_series` for broad discovery.
2. Apply filters (`year`, `downloaded`, `watched`, `actors`) only when the user asks.
3. Use `lookup_movie` or `lookup_series` for targeted title searches.
4. Use `get_movie_details`, `get_series_details`, and `get_series_episodes` for deep dives.

## Best practices

- Keep filters narrow to avoid noisy responses.
- If zero results return, retry without one filter and explain the constraint.
- Treat watch-status results as service-reported state and call out uncertainty if services are stale.

## Safety

- Do not print API keys from config or environment variables.
- Confirm before suggesting bulk changes outside of read-only lookups.
