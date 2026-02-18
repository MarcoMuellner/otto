---
name: home-assistant-ops
description: Use Home Assistant MCP tools to inspect home state and control exposed devices safely.
---

## When to use

- Use this skill for smart-home status checks, device control, and routine automations.
- Prefer this skill when a request depends on current device/entity state.

## Workflow

1. Start by checking relevant entities or areas before taking action.
2. Confirm target device, location, and expected outcome.
3. Execute the smallest safe action.
4. Verify state changed as intended.

## Safety

- Confirm potentially disruptive actions before running them (alarms, locks, HVAC, power-off).
- Avoid broad actions when a specific entity action is available.
- If target entities are not exposed in Home Assistant, report that clearly.

## Good patterns

- Read before write when state is unknown.
- For multi-step routines, report progress and final state.
- Keep responses concise and explicit about what changed.
