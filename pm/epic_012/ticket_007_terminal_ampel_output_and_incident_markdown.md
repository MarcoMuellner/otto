# Ticket 007 - Terminal Traffic-Light Output and Incident Markdown

## Status

- `state`: `planned`

## Objective

Ship operator-friendly terminal output and automatic local incident markdown reports for non-green doctor runs.

## Scope

- Add terminal renderer with:
  - overall traffic-light verdict
  - fast/deep phase summary
  - failed/skipped check details
  - concise remediation hints
- Add automatic incident markdown generation on non-green results.
- Save incident files under local doctor incidents path.
- Print saved incident path in terminal summary.
- Add output redaction guard for secrets/tokens.

## Non-Goals

- No remote issue creation.
- No persistence of green runs.

## Dependencies

- `ticket_003_fast_checks_connectivity_auth_system_cli_smoke.md`
- `ticket_004_deep_extension_requirements_and_probe_contracts.md`
- `ticket_005_deep_job_pipeline_mutating_probe_and_cleanup.md`
- `ticket_006_deep_mcp_tool_live_probes_and_cleanup_manager.md`

## Planned File Changes

- `packages/otto/src/doctor/render/terminal.ts` - traffic-light and details renderer.
- `packages/otto/src/doctor/report/incident-markdown.ts` - markdown report builder.
- `packages/otto/src/doctor/report/write-incident.ts` - report file writer.
- `packages/otto/src/doctor/redaction.ts` - output redaction utility.
- `packages/otto/tests/doctor/terminal-render.test.ts` - renderer snapshot/assertion tests.
- `packages/otto/tests/doctor/incident-markdown.test.ts` - report content tests.
- `packages/otto/tests/doctor/redaction.test.ts` - redaction safety tests.

## Acceptance Criteria

- Doctor terminal output is readable and decisive for green/yellow/red cases.
- Every non-green run auto-generates exactly one local markdown incident file.
- Green runs do not write incident artifacts.
- Reports include repro context and do not leak secrets.

## Verification

- `pnpm -C packages/otto exec vitest run tests/doctor/terminal-render.test.ts`
- `pnpm -C packages/otto exec vitest run tests/doctor/incident-markdown.test.ts`
- `pnpm -C packages/otto exec vitest run tests/doctor/redaction.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable operator UX slice with local incident artifact generation.
