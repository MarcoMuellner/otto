# Ticket 008 - E2E Hardening, CI, and Docs

## Status

- `state`: `planned`

## Objective

Harden Deep Doctor for release with end-to-end coverage, CI validation, and operator documentation.

## Scope

- Add E2E test scenarios for:
  - fast healthy run
  - deep healthy run
  - deep failure run with incident markdown generation
  - cleanup failure signaling path
- Add regression checks for secret redaction in terminal/report output.
- Document operator runbook and troubleshooting matrix.
- Add extension author guidance for probe contracts and cleanup guarantees.
- Wire doctor checks into package quality workflow where appropriate.

## Non-Goals

- No new runtime/control-plane product features.
- No remote execution support.

## Dependencies

- `ticket_001_doctor_cli_surface_and_contract.md`
- `ticket_002_doctor_engine_phase_scheduler_and_result_model.md`
- `ticket_003_fast_checks_connectivity_auth_system_cli_smoke.md`
- `ticket_004_deep_extension_requirements_and_probe_contracts.md`
- `ticket_005_deep_job_pipeline_mutating_probe_and_cleanup.md`
- `ticket_006_deep_mcp_tool_live_probes_and_cleanup_manager.md`
- `ticket_007_terminal_ampel_output_and_incident_markdown.md`

## Planned File Changes

- `packages/otto/tests/e2e/doctor-fast.test.ts` - fast mode E2E scenarios.
- `packages/otto/tests/e2e/doctor-deep.test.ts` - deep mode E2E scenarios.
- `packages/otto/tests/e2e/doctor-incident.test.ts` - incident generation and cleanup-failure path.
- `packages/otto/README.md` - doctor command and runbook section.
- `docs/architecture/ARCHITECTURE.md` - doctor architecture placement and extension seam notes.
- `pm/epic_012/epic_012.md` - status updates and closure checklist.

## Acceptance Criteria

- E2E suite validates core doctor flows and failure handling.
- CI can reliably run doctor tests without flaky behavior.
- Documentation enables operator usage and extension probe authoring without extra discovery.
- Security assertions confirm redaction and no secret leakage in artifacts.

## Verification

- `pnpm -C packages/otto exec vitest run tests/e2e/doctor-fast.test.ts`
- `pnpm -C packages/otto exec vitest run tests/e2e/doctor-deep.test.ts`
- `pnpm -C packages/otto exec vitest run tests/e2e/doctor-incident.test.ts`
- `pnpm -C packages/otto run check`
- `pnpm run check`

## Deployability

- Release-ready deep doctor slice with test-backed confidence and docs.
