# Ticket 008 - End-to-End Hardening, Security Gates, and Rollout Runbook

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Harden the full docs platform rollout with security boundaries, end-to-end validation of both operator and Otto self-query journeys, and an explicit rollback runbook.

## Scope

- Add e2e tests for operator flow and Otto tool flow.
- Add security gates to enforce public static versus authenticated live boundary.
- Add observability and smoke checks for docs service health and live endpoint failures.
- Write release and rollback runbook for docs platform incidents.

## Non-Goals

- No major architecture changes to service topology.
- No redesign of auth model.
- No post-MVP analytics platform work.

## Dependencies

- `pm/epic_014/ticket_006_internal_tools_docs_search_and_open_contract.md`
- `pm/epic_014/ticket_007_operator_cli_and_operations_documentation_coverage.md`

## Planned File Changes

- e2e/integration tests under `packages/otto/tests/**` and docs service test areas.
- CI workflow gates for docs security boundary checks.
- operator runbook/docs updates in docs package and `pm/` references.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Both MVP journeys pass end-to-end checks:
  - operator docs flow (static + authenticated live)
  - Otto docs self-query flow (search + open)
- Public docs build cannot expose live runtime endpoints/content.
- Live endpoint auth and failure behavior are observable and test-covered.
- Rollback procedure is documented and executable.

## Verification

- `pnpm run check`
- Dedicated e2e workflow for docs platform and auth boundary tests.
- Release dry-run using runbook checklist.

## Deployability

- Deployable hardening slice that closes rollout risk before broad adoption.
