# Ticket 005 - Extension Enable/Disable for Tools and Skills

## Objective

Enable and disable installed extensions so their tools and skills are available to OpenCode runtime via deterministic activation wiring.

## Why

Installed extensions are not useful until they are activated into runtime-visible OpenCode config and paths.

## Scope

- Add commands:
  - `ottoctl extension enable <id>[@version]`
  - `ottoctl extension disable <id>`
- Materialize active extension assets into OpenCode runtime paths:
  - tools wired from extension store into `~/.otto/.opencode/tools`
  - skills wired into runtime-visible skill location
- Generate deterministic extension overlay config file for OpenCode merge input.
- Update activation state to record enabled version and scope target.

## Non-Goals

- MCP-specific connectivity/diagnostics.
- Scheduled lane scope enforcement details.

## Dependencies

- `ticket_004`.

## Acceptance Criteria

- Enabling extension exposes declared tools/skills to OpenCode runtime.
- Disabling extension removes its active runtime footprint.
- Re-enabling different version updates active wiring safely.

## Verification

- CLI integration tests for enable/disable/version switching.
- Runtime smoke test that enabled tool becomes callable.

## Deployability

- Deployable extension activation for tools/skills while keeping MCP behavior unchanged.
