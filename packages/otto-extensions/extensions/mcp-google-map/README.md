# MCP Google Map Extension

This extension adds the community `@cablate/mcp-google-map` server to Otto and provides a travel-routing skill.

## What this installs

- MCP server bridge: `@cablate/mcp-google-map` via `npx`, proxied into stdio by `mcp-proxy`
- Skill: `google-map-routing`

## Why this integration

- It exposes practical Google Maps tools for place lookup, geocoding, nearby search, distance matrix, directions, and elevation.
- It supports transit, driving, walking, and bicycling route modes for assistant-side comparisons.
- It remains useful when you want self-hostable control instead of a hosted MCP dependency.

## Prerequisites

- Node.js >= 22
- `bash`, `curl`, `npx`, and `mcp-proxy` available in PATH
- Google Maps API key set in Otto runtime env:

```bash
ottoctl env set GOOGLE_MAPS_API_KEY '<your-google-maps-api-key>'
```

- Google Maps APIs enabled in the linked GCP project:
  - Places API (New)
  - Geocoding API
  - Directions API and/or Routes-related APIs used by your key setup

Optional:

```bash
ottoctl env set MCP_GOOGLE_MAP_PORT '3000'
```

## Install

From the Otto host:

```bash
ottoctl extension install mcp-google-map
```

If Otto is already running, restart to reload OpenCode config:

```bash
ottoctl restart
```

## Verify

- Check MCP entry exists in `~/.otto/.opencode/opencode.jsonc` under `mcp.mcp-google-map`.
- Check skill exists at `~/.otto/.opencode/skills/google-map-routing/SKILL.md`.
- Check server/proxy logs in `~/.otto/logs/mcp-google-map.log`.

## Troubleshooting

- If startup fails, confirm `GOOGLE_MAPS_API_KEY` is present and valid.
- If place tools return 403, verify Places API (New) is enabled for the same GCP project/key.
- If proxy connection fails, ensure `mcp-proxy` is installed and `MCP_GOOGLE_MAP_PORT` is not already occupied.
