# Architecture Baseline (Initial Scan)

Generated: 2026-03-01T14:15:00Z  
Scope: `packages/otto`, `packages/otto-control-plane`, `packages/otto-extension-sdk`, `packages/otto-extensions`, `packages/experiments`, `packages/ui-design`

## System Intent and Runtime Topology

Otto is a command-driven local operations runtime with a web control plane. The core runtime (`packages/otto`) owns execution, scheduling, APIs, extension install/activation, and Telegram interaction surfaces. The control-plane package is a React Router SSR+BFF layer over runtime contracts. Extension packages provide validated plugin manifests and generated registry artifacts. Experiments and ui-design are non-core support surfaces. [fact-003] [fact-004] [fact-006] [fact-007] [fact-019] [fact-035]

Runtime topology (current):

- Primary runtime process boots from `runServe`, composes internal API, external API, OpenCode server, scheduler, and Telegram worker lifecycle. [fact-006] [fact-007] [fact-008] [fact-009] [fact-010]
- Operator CLI surfaces are bundled as separate runtime entrypoints (`index`, `extension-cli`, `model-cli`). [fact-003] [fact-004]
- Control-plane process hosts UI routes and BFF `/api/*` routes in one route graph. [fact-019]
- Extension registry is generated from catalog manifests and consumed remotely by runtime extension installer/update flows. [fact-018] [fact-035] [fact-036]
- `packages/ui-design` is design/prototype material, not production runtime code. [fact-040] [fact-041]

## Package Responsibilities and Boundaries

Package-level scan findings:

- `packages/otto`: authoritative runtime orchestration, API ownership, scheduler, worker runtime, persistence, and CLI operators. Boundary is strong around SQLite and token-based auth, but startup currently rewrites effective OpenCode config (runtime side effect). [fact-005] [fact-011] [fact-013] [fact-014] [fact-015]
- `packages/otto-control-plane`: web/BFF bridge to runtime APIs with a central adapter (`otto-external-api.server.ts`), plus direct runtime DB/config reads for chat session mapping (boundary leak risk). [fact-021] [fact-022] [fact-023] [fact-024]
- `packages/otto-extension-sdk`: contract validator and parser layer for extension catalogs; currently assumes sibling package layout by default root path. [fact-032] [fact-033] [fact-034]
- `packages/otto-extensions`: manifest-driven extension payload catalog and registry artifact generation; validation contract owned externally by SDK. [fact-035] [fact-036] [fact-037]
- `packages/experiments`: isolated integration probes only, no shared architecture dependency beyond workspace tooling. [fact-039]
- `packages/ui-design`: UX specs + static prototype with a single in-page controller and command-palette model mapped from runtime semantics. [fact-040] [fact-041]

Overall (cross-package aggregation):

- Highest operational coupling is between `otto` and `otto-control-plane`, then `otto` and extension packages. [fact-047]
- Main cross-boundary contract set is: runtime external API + shared token file + runtime DB/config path conventions. [fact-013] [fact-014] [fact-020] [fact-023]
- No local import cycles were detected in the current package set (regex-based static pass; dynamic imports not fully covered). [fact-043]

## Key Execution Flows

1) Serve boot flow (`otto`)

- Config/asset checks and OpenCode config materialization.
- Persistence + repo initialization.
- Internal API -> external API -> OpenCode server startup.
- Model catalog sync/refresh, scheduler start, Telegram worker best-effort.
- Graceful signal-driven shutdown.
  Evidence: [fact-005] [fact-006] [fact-007] [fact-008] [fact-009] [fact-010]

2) Control-plane to runtime flow

- Route loader/action invokes server adapter.
- Adapter applies bearer auth and schema validation.
- Runtime external API handles command/query.
  Evidence: [fact-021] [fact-025] [fact-013]

3) Extension release/install flow

- `otto-extensions` generates tarball artifacts + registry index.
- Runtime resolves registry entry and installs verified archive.
- Catalog validity enforced via SDK validation contract path.
  Evidence: [fact-017] [fact-018] [fact-033] [fact-035] [fact-036]

4) Chat/session mapping flow

- Control-plane resolves runtime state DB path from Otto config/home.
- Control-plane reads `session_bindings` directly from runtime SQLite.
  Evidence: [fact-022] [fact-023] [fact-024]

## State and Persistence Boundaries

- Runtime config: `~/.config/otto/config.jsonc`, validated and defaulted by `otto-config.ts`. [fact-016]
- Runtime database: `<ottoHome>/data/otto-state.db` (scheduler, task audit, command audit, session bindings). [fact-015]
- Shared API token: `<ottoHome>/secrets/internal-api.token` used by internal API, external API, and control-plane auth config. [fact-014] [fact-020]
- Extension registry/artifacts: `packages/otto-extensions/registry/index.json` + artifacts, consumed remotely by runtime installer. [fact-018] [fact-035]
- UI design prototype state: in-memory browser state only; no backend state boundary. [fact-040]

## Integration Boundaries

- Runtime API boundary: Fastify internal/external APIs protected by bearer token checks. [fact-011] [fact-012] [fact-013]
- Control-plane boundary: typed adapter/facade centralizes runtime calls; some routes mix server direct calls with client BFF fetches (inconsistent access path). [fact-021] [fact-025] [fact-026] [fact-030]
- Extension contract boundary: SDK owns manifest schema/validation while extension package owns descriptors/artifacts. [fact-033] [fact-035] [fact-036]
- Design/runtime boundary: ui-design references runtime mental model but is not integrated into production route/build pipeline. [fact-041]

## Detected Design Patterns

- Composition root in `runServe` for subsystem wiring and lifecycle ordering. [fact-006] [fact-007] [fact-009]
- Repository pattern for runtime persistence over one SQLite boundary. [fact-015] [fact-043]
- Adapter/facade pattern in control-plane external API client and env resolution. [fact-020] [fact-021]
- Service-layer split between transport routes and `api-services` mutations/reads. [fact-011] [fact-013] [fact-042]
- Manifest-driven plugin architecture with generated registry metadata. [fact-035] [fact-037]
- Command-dispatcher entrypoint model in runtime and reflected in ui-design spec. [fact-004] [fact-041]

## Top Architectural Risks (Ranked)

1. **God module + unstable central runtime path** (`runtime/serve.ts`, `internal-api/server.ts`) combines high churn and high coupling; failures here affect most runtime surfaces. Priority ~0.88. [fact-044] [fact-046]
2. **Cross-package boundary leakage** (control-plane reads runtime config + DB directly) creates fragile shared filesystem/table contracts outside API versioning. Priority ~0.72. [fact-022] [fact-023] [fact-024] [fact-047]
3. **Unstable central persistence surface** (`persistence/repositories.ts`) has high fan-in and broad co-change blast radius. Priority ~0.79. [fact-043] [fact-046]
4. **Shotgun-surgery tendency in jobs UI routes** duplicated constants/parsers across `jobs.tsx` and `jobs.$jobId.tsx` increases coordinated edit cost. Priority ~0.61. [fact-027] [fact-028] [fact-045]
5. **Leaky abstraction in task lane reads** (`void lane`) indicates future lane-specific behavior may bypass intended service boundary. Priority ~0.55. [fact-042]
6. **Packaging portability/coupling risks** from SDK sibling-path default and system `tar` dependency in registry generation. Priority ~0.54. [fact-032] [fact-035]

## Confidence Notes

- High confidence in package boundaries, entrypoints, and runtime flows (direct code/config evidence).
- Medium confidence in churn/coupling hotspots (derived from git history snapshots and static import/co-change scripts, not semantic runtime traces). [fact-043] [fact-044] [fact-046]
- Lower confidence for future drift predictions in `ui-design` because it is prototype/spec code and not on main runtime path.
