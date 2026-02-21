# AGENTS Guide for `otto`
This file is the operating guide for coding agents working in this repository.

## Repository Shape
- Monorepo managed with `pnpm` workspaces.
- Main packages:
  - `packages/otto` (core runtime, CLI, bundled release artifact)
  - `packages/otto-control-plane` (React Router control-plane web process + BFF)
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

## Running a Single Test (Important)
Preferred patterns:
- Single test file in core package:
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts`
- Single test by name in core package:
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts -t "test name"`
- Single test file in extension SDK package:
  - `pnpm -C packages/otto-extension-sdk exec vitest run tests/path/to/file.test.ts`
- Watch mode for one file:
  - `pnpm -C packages/otto exec vitest tests/path/to/file.test.ts`

Notes:
- `packages/otto-extensions` currently has no real tests (`test` prints a message).
- Vitest include globs are `tests/**/*.test.ts`.

## Package-Specific Commands
Use `pnpm -C <package> run <script>` for scoped work.

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
- In ESM TypeScript files, local import specifiers use `.js`.

### Formatting
- Always use repo scripts for formatting and linting.
- In `packages/otto`, Prettier settings are:
  - no semicolons
  - double quotes
  - trailing commas where valid in ES5
  - print width 100
- In other packages, follow file-local style and pass `format:check`.

### TypeScript and Types
- `strict` mode is enabled; keep code fully type-safe.
- Avoid `any` unless absolutely unavoidable.
- Prefer explicit types for exported APIs.
- Use `zod` schemas for runtime validation and inferred types.
- Keep `unknown` at boundaries; narrow before use.

### Naming
- File names: `kebab-case.ts`.
- Functions and variables: `camelCase`.
- Types/interfaces/type aliases: `PascalCase`.
- Constants:
  - `UPPER_SNAKE_CASE` for true module constants
  - `camelCase` for derived locals
- Prefer domain-specific names (`resolveOttoConfigPath`, `runTelegramWorker`).

### Function Design
- Keep functions focused and composable.
- Prefer pure helpers for parsing and transformation.
- Inject side-effect dependencies when practical for testability.
- Add JSDoc on exported functions and explain why they exist.

### Error Handling
- Throw actionable errors.
- In `catch`, narrow error types before field access (for example `NodeJS.ErrnoException`).
- Handle expected system errors explicitly (`ENOENT`) and rethrow unknown failures.
- For CLI entrypoints, log structured context and set exit code deterministically.

### Logging
- Use structured logging (Pino in `packages/otto`).
- Include contextual fields (`component`, `command`, identifiers, counts).
- Keep human message text concise and details in structured fields.

## Testing Conventions
- Framework: Vitest.
- Structure non-trivial tests as AAA (Arrange, Act, Assert).
- Test names should describe behavior, not implementation internals.
- Prefer deterministic tests; avoid timing/network flakiness.
- Use temp directories and cleanup hooks for filesystem tests.

## Build/Release Awareness
- Core runtime is bundled with `tsdown` for Node runtime distribution.
- Core build output is `packages/otto/dist`.
- Do not edit generated `dist/` artifacts manually.

## Agent Execution Checklist
Before handoff:
1. Run targeted tests for changed areas first.
2. Run package-level checks for touched packages.
3. Run `pnpm run check` when changes span packages/shared behavior.
4. Ensure lint and format checks pass.
5. Ensure generated artifacts were not edited by hand.

## Cursor/Copilot Rules Status
No repository-level Cursor or Copilot instruction files were found:
- `.cursor/rules/` not present
- `.cursorrules` not present
- `.github/copilot-instructions.md` not present

If these files are added later, update this AGENTS file and treat them as higher-priority agent instructions.
