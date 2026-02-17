---
name: playwright-mcp-browse
description: Use Playwright MCP to navigate websites, inspect pages, and complete browser workflows.
---

## When to use

- Use this skill when you need interactive browser navigation instead of static HTTP fetches.
- Prefer this skill for login-gated pages, dynamic apps, or multi-step website flows.

## Workflow

1. Ensure the Playwright MCP server is enabled.
2. Start with navigation and snapshot tools to understand current page structure.
3. Use targeted click/type/select operations by exact references from the latest snapshot.
4. Re-snapshot after each state-changing action.

## Best practices

- Prefer `browser_snapshot` over screenshots for state understanding.
- Keep actions small and verifiable.
- Use `browser_console_messages` and `browser_network_requests` when a flow fails unexpectedly.
- Use `browser_install` if browser binaries are missing.

## Safety

- Avoid destructive actions unless explicitly requested.
- Confirm sensitive operations (payments, account deletion, settings reset) before executing.
