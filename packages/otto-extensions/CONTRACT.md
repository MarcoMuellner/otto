# Extension Contract

This document defines the v1 extension catalog contract used by Otto.

## Catalog Layout

Extensions are stored under:

- `packages/otto-extensions/extensions/<extension-id>/`

Each extension directory must include:

- `manifest.jsonc`

Optional payload assets can include:

- `tools/`
- `skills/`
- `mcp.jsonc` (or inline MCP config in manifest)
- overlay files (for OpenCode/task-config fragments)

## Manifest Schema (v1)

Required fields:

- `schemaVersion`: `1`
- `id`: kebab-case identifier (must match directory name)
- `name`: display name
- `version`: semver (`x.y.z`, prerelease/build tags allowed)
- `description`: concise summary
- `payload`: at least one payload section must be defined

Optional fields:

- `tags`: string array
- `compatibility.otto`: semver range hint
- `compatibility.node`: runtime version range hint
- `requirements.env`: required env vars
- `requirements.files`: required files (runtime-relative or absolute)
- `requirements.binaries`: required executables
- `dependencies`: extension dependency declarations
- `policy`: recommended scope hints

Payload sections:

- `payload.tools.path`: directory path containing tool files
- `payload.tools.packageJson`: package file used for tool dependencies
- `payload.skills.path`: directory path containing markdown skills
- `payload.mcp.inline`: inline MCP object
- `payload.mcp.file`: relative path to MCP JSON/JSONC fragment
- `payload.overlays.opencode`: OpenCode config overlay file path
- `payload.overlays.taskConfig`: task-config overlay file path

## Validation Rules

The catalog validator enforces:

1. Manifest exists and parses as JSONC.
2. Manifest satisfies schema.
3. Manifest `id` equals extension directory name.
4. Referenced payload paths exist.
5. Duplicate `id@version` combinations are rejected.
6. Dependency references must point to known extension ids.

## Validator Usage

Run from workspace root:

```bash
pnpm run extensions:validate
```

Machine-readable output:

```bash
pnpm run extensions:validate -- --json
```

Validate a single extension:

```bash
pnpm run extensions:validate -- --id telegram-ops
```

Override catalog root path (fixtures/testing):

```bash
pnpm run extensions:validate -- --catalog /tmp/my-catalog
```

## Diagnostics

Validation issues use structured diagnostic fields:

- severity (`error` or `warning`)
- issue code (for automation)
- extension reference (`id`, `version`)
- file path and optional field path
- actionable message and hint

Common issue codes:

- `manifest.missing`
- `manifest.parse_error`
- `manifest.schema_error`
- `manifest.id_mismatch`
- `payload.path_missing`
- `catalog.duplicate_id_version`
- `dependency.unknown_extension`
- `catalog.extension_not_found`

## Example Extension

Minimal extension:

- manifest with one payload section (`skills`)
- corresponding `skills/` directory with at least one markdown file

Full extension:

- tools + skills + MCP fragment + overlays
- requirements and dependencies declared
