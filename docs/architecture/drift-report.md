# Drift Report (Initial Baseline)

Generated: 2026-03-01T14:15:00Z

## Baseline

- Previous snapshot: **none**
- This report establishes the first architecture baseline for future incremental drift checks.

## Inferred Contracts and Current Conformance

| contract | conformance | notes | evidence |
| --- | --- | --- | --- |
| contract-001 | conformant | Runtime command selection remains centralized in one dispatcher entrypoint. | fact-004 |
| contract-002 | conformant | Internal/external APIs share one persisted token and enforce bearer auth. | fact-012, fact-013, fact-014 |
| contract-003 | conformant | Serve mode still acts as composition root for startup/lifecycle order. | fact-006, fact-007, fact-008, fact-009, fact-010 |
| contract-004 | mostly-conformant | Runtime APIs are repository-backed; however persistence surface is very centralized and coupled. | fact-006, fact-007, fact-015, fact-043 |
| contract-005 | partial | Adapter exists, but routes still mix direct server calls and client BFF fetch paths. | fact-021, fact-025, fact-026, fact-030 |
| contract-006 | conformant | Extension contract enforcement is delegated to SDK and invoked through workspace scripts. | fact-017, fact-033, fact-036 |
| contract-007 | non-conformant | SDK default root assumes sibling monorepo layout, reducing portability. | fact-032 |
| contract-008 | conformant | Server-only secret boundary reinforced with client bundle marker scan. | fact-020, fact-031 |
| contract-009 | non-conformant | Control-plane still reads runtime SQLite/session data directly instead of API contract. | fact-023, fact-024 |

## Baseline Drift Risks to Watch

1. Runtime core sprawl (`serve.ts`, `internal-api/server.ts`, `repositories.ts`) is the highest drift amplifier.
2. Control-plane filesystem/table coupling to runtime internals can drift silently across releases.
3. Jobs route duplication creates parallel behavior edits and easier divergence.
4. SDK catalog-root default can drift from real deployment layouts outside monorepo.

## Suggested Drift Gates for Next Scan

- Compare central module churn and co-change deltas for: `runtime/serve.ts`, `internal-api/server.ts`, `persistence/repositories.ts`, `otto-external-api.server.ts`.
- Verify no new direct control-plane reads of runtime SQLite tables/config paths.
- Verify jobs route helper duplication trend decreases rather than increases.
- Re-run cycle detection and fail build if package-local import cycles appear.
