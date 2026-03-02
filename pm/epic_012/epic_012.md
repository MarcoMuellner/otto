# Epic 012 - Deep Doctor Healthcheck and End-to-End Regression Guard

## Status

- `id`: `epic_012`
- `type`: epic ticket
- `state`: `planned`
- `goal`: ship `ottoctl doctor` and `ottoctl doctor --deep` as a local-first healthcheck system with clear traffic-light output, live end-to-end probes, cleanup guarantees for mutating checks, and automatic local incident markdown reports on non-green runs.

## Why

After updates, regressions can hide across auth, connectivity, jobs, MCP/tool integrations, and runtime surfaces. We need one operator command that quickly tells what is healthy, what is broken, and how to reproduce failures.

## Decisions Locked In

- CLI-only in v1 (`ottoctl`), no control-plane trigger in this epic.
- Two modes:
  - `ottoctl doctor` = fast checks only.
  - `ottoctl doctor --deep` = fast + slow checks.
- Both fast and deep can return red.
- Deep mode uses live execution probes; missing credentials are errors.
- Deep mode may run mutating probes, but cleanup is mandatory.
- If cleanup cannot be guaranteed before execution, that probe is skipped.
- Local target only for v1 (no remote execution in this epic).
- No remote issue/ticket creation in v1.
- On non-green runs, auto-generate local `.md` incident report.
- On green runs, persist nothing.
- Exit codes:
  - `0`: green
  - `1`: yellow or red
  - `2`: doctor internal failure
- Execution model is hybrid:
  - independent checks run in parallel by phase
  - mutating probes are serialized by integration lock key

## Success Criteria

- Fast mode returns deterministic green/yellow/red within a short runtime budget.
- Deep mode validates critical paths end-to-end, including live integration behavior.
- Non-green results always include actionable terminal output and one local incident markdown file path.
- Mutating probes leave no residue in healthy completion paths.
- Output/reporting never leaks secrets.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Doctor CLI surface and exit contract.
2. `ticket_002`: Doctor engine, phased scheduler, and result model.
3. `ticket_003`: Fast checks (connectivity, auth, system status, CLI smoke).
4. `ticket_004`: Deep extension requirement checks and probe contracts.
5. `ticket_005`: Deep job-pipeline mutating probe with cleanup.
6. `ticket_006`: Deep MCP/tool live probes and cleanup manager.
7. `ticket_007`: Terminal traffic-light renderer and auto incident markdown.
8. `ticket_008`: End-to-end hardening, CI coverage, and operator docs.

## Out of Scope

- Control-plane UI/BFF trigger surface for doctor in this epic.
- Remote/deploy-host doctor execution target.
- GitHub/Linear/Jira ticket creation automation.
- Long-term run history persistence for green runs.
