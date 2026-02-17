# Ticket 008 - Upgrade Migration, Documentation, and End-to-End Validation

## Objective

Finalize extension platform rollout with migration support, operator documentation, and end-to-end validation.

## Why

Feature-complete extension mechanics must be operationally consumable and safe for existing installations.

## Scope

- Add migration logic for existing installs to initialize extension directories/state safely.
- Update install/update/setup docs and operator playbooks.
- Document extension authoring contract (manifest, tools, skills, MCP, requirements).
- Add E2E test scenarios covering:
  - install -> enable -> use -> disable
  - version switch and rollback
  - scheduled profile-scoped extension usage
  - doctor diagnostics on missing requirements

## Non-Goals

- Public extension registry.
- Multi-repo extension publishing workflow.

## Dependencies

- `ticket_007`.

## Acceptance Criteria

- Existing users can upgrade without manual intervention.
- Documentation is sufficient for operator use and extension authoring.
- E2E suite demonstrates extension lifecycle reliability.

## Verification

- Upgrade simulation tests from pre-extension workspace.
- Full `pnpm run check` plus extension E2E matrix.

## Deployability

- Deployable release-ready completion slice for extension platform rollout.
