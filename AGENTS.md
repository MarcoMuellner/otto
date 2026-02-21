# AGENTS Guide for `otto`

This file is the operating guide for coding agents working in this repository.
Follow these rules before making changes.

## Repository Shape

- Monorepo managed with `pnpm` workspaces.
- Main packages:
  - `packages/otto` (core runtime, CLI, bundled release artifact)
  - `packages/otto-extension-sdk` (shared extension validation library)
  - `packages/otto-extensions` (extension catalog scaffolding)
- Root scripts proxy to package scripts and are the preferred entrypoint.

## Required Runtime/Tooling

- Node.js `>=22`
- `pnpm@10`
- TypeScript + ESM (`moduleResolution: NodeNext`)

## Build, Lint, Typecheck, Test

Run from repo root unless noted.

### Install

- `pnpm install`

### Fast Quality Gate (all packages)

- `pnpm run check`
  - Runs typecheck, lint, format check, extension validation, and tests.

### Build

- `pnpm run build`
- `pnpm run build:local` (syncs local version first)

### Lint

- `pnpm run lint`
- `pnpm run lint:fix`

### Typecheck

- `pnpm run typecheck`

### Format

- `pnpm run format`
- `pnpm run format:check`

### Tests (workspace)

- `pnpm run test`
- `pnpm run test:watch`
- `pnpm run test:coverage`

## Running a Single Test (important)

Preferred patterns:

- Single test file in core package:
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts`
- Single test by name in core package:
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts -t "test name"`
- Single test file in extension SDK package:
  - `pnpm -C packages/otto-extension-sdk exec vitest run tests/path/to/file.test.ts`
- If you need watch mode for one file:
  - `pnpm -C packages/otto exec vitest tests/path/to/file.test.ts`

Notes:

- `packages/otto-extensions` currently has no real tests (`test` prints a message).
- Vitest includes are configured as `tests/**/*.test.ts`.

## Package-Specific Commands

Use `pnpm -C <package> run <script>` when scoping work.

- Core package (`packages/otto`):
  - `dev`, `setup`, `serve`, `telegram-worker`, `start`
  - `build`, `build:local`, `version:sync`
  - `extensions:validate`
- Extension SDK (`packages/otto-extension-sdk`):
  - `check`, `typecheck`, `lint`, `test`, `format:check`
- Extensions catalog (`packages/otto-extensions`):
  - `registry:generate`, `build`, `test`

## Source Layout Conventions

- Core source: `packages/otto/src/**/*.ts`
- Core tests: `packages/otto/tests/**/*.test.ts`
- SDK source: `packages/otto-extension-sdk/src/**/*.ts`
- SDK tests: `packages/otto-extension-sdk/tests/**/*.test.ts`
- Keep tests outside `src/` (repository convention).

## Code Style Rules

### Imports

- Group imports in this order:
  1. Node built-ins (`node:*`)
  2. Third-party packages
  3. Local project imports
- Keep one blank line between groups.
- Prefer `import type` for type-only imports.
- In ESM TS files, local imports use `.js` extension in specifiers.

### Formatting

- Always run formatter/lint scripts instead of hand-formatting at scale.
- In `packages/otto`, Prettier settings are:
  - no semicolons
  - double quotes
  - trailing commas where valid in ES5
  - print width 100
- In other packages, follow existing file style and pass `format:check`.

### TypeScript and Types

- `strict` mode is enabled; keep code fully type-safe.
- Avoid `any` unless absolutely unavoidable.
- Prefer explicit types for exported APIs.
- Use `zod` schemas for runtime config/data validation and infer types from schemas.
- Keep `unknown` at boundaries; narrow before use.

### Naming

- File names: `kebab-case.ts`.
- Functions/variables: `camelCase`.
- Types/interfaces/type aliases: `PascalCase`.
- Constants:
  - `UPPER_SNAKE_CASE` for true constants (especially module-level)
  - otherwise `camelCase` for derived locals
- Use descriptive names with domain context (`resolveOttoConfigPath`, `runTelegramWorker`).

### Function Design

- Keep functions focused and composable.
- Prefer pure helpers for transform/parse logic.
- Inject dependencies for side effects when practical (improves testability).
- Add JSDoc to exported functions, explaining why the function exists.

### Error Handling

- Fail with actionable messages.
- In `catch`, narrow error types before field access (for example `NodeJS.ErrnoException`).
- Handle expected system errors explicitly (for example `ENOENT`) and rethrow unexpected ones.
- For CLI/runtime entrypoints, log structured context and set exit code deterministically.

### Logging

- Use structured logging (Pino in core package).
- Include contextual fields in log objects (`component`, `command`, identifiers, counts).
- Keep human-readable message concise; put details in structured fields.

## Testing Conventions

- Framework: Vitest.
- Test structure: AAA (Arrange, Act, Assert) with explicit section comments for non-trivial tests.
- Test names should describe observable behavior, not implementation detail.
- Prefer deterministic tests; avoid timing/network flakiness when possible.
- Use temp directories and cleanup in hooks for filesystem tests.

## Build/Release Behavior Awareness

- Core runtime is bundled with `tsdown` for Node runtime distribution.
- Build output for core package goes to `packages/otto/dist`.
- Do not edit generated `dist/` outputs manually.

## Agent Execution Checklist

Before opening a PR or handing off work:

1. Run targeted tests for changed areas (single-file first).
2. Run package-level checks for touched packages.
3. Run `pnpm run check` when changes span multiple packages or shared behavior.
4. Ensure formatting and lint pass.
5. Ensure no accidental changes to generated artifacts.

## Cursor/Copilot Rules Status

No repository-level Cursor or Copilot instruction files were found during analysis:

- `.cursor/rules/` not present
- `.cursorrules` not present
- `.github/copilot-instructions.md` not present

If these files are added later, update this AGENTS file and treat those rules as higher-priority project instructions.
