# Anti-Pattern Report (Initial Scan)

Generated: 2026-03-01T14:15:00Z

Scoring model used:

- `priority = confidence * impact * trendWeight`
- trendWeight > 1.0 for high churn/co-change hotspots

## Findings (highest priority first)

| id | type | area | confidence | impact | priority | evidence | recommended fix |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| AP-001 | god_module | `packages/otto/src/internal-api/server.ts` | 0.90 | 0.85 | 0.88 | fact-011, fact-012, fact-044, fact-046 | Split by route domain (`/tasks`, `/settings`, `/background-jobs`, `/telegram`) and move shared auth/error glue to a thin server shell. |
| AP-002 | unstable_central_module | `packages/otto/src/runtime/serve.ts` | 0.88 | 0.86 | 0.87 | fact-004, fact-006, fact-044, fact-046 | Extract startup pipeline stages (`config`, `api`, `models`, `scheduler`, `worker`) into idempotent composable modules with explicit dependency contracts. |
| AP-003 | unstable_central_module | `packages/otto/src/persistence/repositories.ts` | 0.84 | 0.82 | 0.79 | fact-043, fact-046 | Partition repository file by bounded contexts (`jobs`, `audit`, `messaging`, `sessions`) while preserving one DB boundary interface. |
| AP-004 | temporal_coupling_hotspot | `packages/otto` runtime core (`serve`, `internal-api`, `repositories`) | 0.84 | 0.82 | 0.79 | fact-046, fact-044 | Introduce integration seams and contract tests around APIs/repositories so common edits do not require cross-file synchronized changes. |
| AP-005 | boundary_leakage | control-plane chat path reads runtime config + sqlite directly | 0.86 | 0.80 | 0.72 | fact-022, fact-023, fact-024, fact-047 | Add external API endpoints for session bindings/thread metadata and migrate control-plane away from direct DB/table access. |
| AP-006 | shotgun_surgery_hotspot | `jobs.tsx` + `jobs.$jobId.tsx` duplicated route utilities | 0.81 | 0.71 | 0.61 | fact-027, fact-028, fact-045 | Move shared constants/parsers/form mappers into `features/jobs/*` and keep route files as composition layers. |
| AP-007 | leaky_abstraction | `listTasksForLane` ignores lane parameter | 0.92 | 0.60 | 0.55 | fact-042 | Either implement lane filtering in service boundary now or remove the parameter until lane semantics are real. |
| AP-008 | boundary_leakage | SDK hardcoded sibling catalog root path | 0.88 | 0.62 | 0.55 | fact-032 | Require explicit catalog root in CLI wrappers and keep default path only as fallback behind an opt-in flag. |
| AP-009 | unstable_central_module | `packages/otto-control-plane/app/server/otto-external-api.server.ts` | 0.74 | 0.66 | 0.54 | fact-021, fact-043, fact-045 | Split per domain adapter modules (`jobs`, `models`, `system`, `settings`) with one shared request primitive. |
| AP-010 | god_module | `packages/otto-control-plane/app/routes/chat.tsx` (1339 lines) | 0.77 | 0.63 | 0.51 | fact-029, fact-030, fact-045 | Extract chat state machine/hooks and presentation subcomponents to reduce route-level orchestration sprawl. |

## Required Checks Coverage

- cyclic dependencies: no local import cycles detected in current package set (static regex import graph pass). [fact-043]
- god module/object: detected (`internal-api/server.ts`, `runtime/serve.ts`, `chat.tsx`). [fact-011] [fact-029] [fact-044]
- boundary leakage: detected (control-plane direct runtime DB/config coupling, SDK sibling-path assumption). [fact-023] [fact-024] [fact-032]
- leaky abstractions: detected (`void lane` in task read boundary). [fact-042]
- temporal coupling hotspots: detected in runtime core co-change cluster. [fact-046]
- shotgun surgery hotspots: detected in duplicated jobs route concerns. [fact-027] [fact-028]
- unstable central modules (high churn + high centrality): detected in `serve.ts`, `repositories.ts`, `otto-external-api.server.ts`. [fact-043] [fact-044] [fact-045]

## Small, Executable Fix Plan

1. Break `internal-api/server.ts` into domain route modules first; this reduces immediate hotspot blast radius.
2. Introduce `external/session-bindings` endpoint in runtime and migrate control-plane chat to API-only access.
3. Extract shared jobs route helpers into `features/jobs/mutations.ts` and `features/jobs/form-state.ts`.
4. Add a CI architecture check script for import cycles and hotspot drift (`serve.ts`, `repositories.ts`, `otto-external-api.server.ts`).
