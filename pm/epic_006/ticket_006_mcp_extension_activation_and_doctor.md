# Ticket 006 - MCP Extension Activation and `doctor` Checks

## Objective

Support MCP contribution from extensions and provide diagnostics for missing requirements and auth prerequisites.

## Why

MCP integrations have higher runtime fragility (binary path, secrets, auth). Operators need explicit readiness checks.

## Scope

- Extend enable flow to include MCP definitions from extension payload.
- Merge MCP fragments into generated OpenCode extension overlay config.
- Add command:
  - `ottoctl extension doctor [id]`
- `doctor` checks:
  - required binaries in PATH
  - required env vars
  - required secret files
  - basic OpenCode MCP status output for enabled MCP extension entries

## Non-Goals

- Automated OAuth browser flows.
- Auto-remediation of missing requirements.

## Dependencies

- `ticket_005`.

## Acceptance Criteria

- Enabled MCP extensions appear in OpenCode MCP list/status.
- `doctor` reports missing prerequisites with actionable messages.
- Extension enable fails fast when hard requirements are missing (configurable strict mode).

## Verification

- Unit tests for requirement evaluation.
- Integration tests with fixture extensions and missing dependency scenarios.

## Deployability

- Deployable MCP extension support with diagnostics and no policy-scope changes yet.
