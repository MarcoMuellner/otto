---
name: google-map-routing
description: Use mcp-google-map tools for place lookup, geocoding, and route comparison across travel modes.
---

## When to use

- Use this skill for location lookup, nearby discovery, and route planning by car, transit, walking, or bike.
- Prefer this skill when the user asks for best route options, ETA comparisons, or place details in a target area.

## Workflow

1. Resolve ambiguous origins/destinations first with `maps_geocode`.
2. Use `search_nearby` to discover candidate places and `get_place_details` to confirm exact targets.
3. Compare routes using `maps_directions` with multiple travel modes when the user asks for best options.
4. Use `maps_distance_matrix` for bulk candidate comparisons (for example multiple destinations).
5. Report top options with mode, ETA, duration, distance, and important constraints.

## Response quality

- Show at least two route options for open-ended "best route" requests when available.
- Include local timing assumptions (departure now vs explicit departure time).
- Call out uncertainty clearly when transit coverage is incomplete in a region.

## Safety

- Confirm before using precise home/work addresses if the user did not explicitly provide them.
- Avoid over-precision in travel time claims; traffic and transit schedules can change quickly.
- If geocoding or directions fail, explain likely cause and propose the smallest useful retry.
