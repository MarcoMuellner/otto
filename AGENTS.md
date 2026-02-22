# AGENTS Guide for `otto`
This file is the operating guide for coding agents working in this repository.

## Repository Overview
- Monorepo managed with `pnpm` workspaces (`pnpm-workspace.yaml` includes root and `packages/*`).
- Primary packages:
  - `packages/otto` - core runtime, CLI, bundled release artifact.
  - `packages/otto-control-plane` - React Router control-plane web process + BFF.
  - `packages/otto-extension-sdk` - shared extension validation/contracts library.
  - `packages/otto-extensions` - extension catalog + registry artifact generator.
  - `packages/experiments` - ad-hoc integration experiments (outside root quality gate).
- Root scripts are the preferred entrypoint for cross-package work.

## Required Tooling
- Node.js `>=22`
- `pnpm@10`
- TypeScript + ESM across packages
  - `packages/otto`, `packages/otto-extension-sdk`: `moduleResolution: NodeNext`
  - `packages/otto-control-plane`: `moduleResolution: Bundler`

## Workspace Commands (run from repo root)
### Install
- `pnpm install`
### Build
- `pnpm run build`
- `pnpm run build:local` (sync local version first)
### Lint / Typecheck / Format
- `pnpm run lint`
- `pnpm run lint:fix` (only fixes `packages/otto`)
- `pnpm run typecheck`
- `pnpm run format`
- `pnpm run format:check`
### Test
- `pnpm run test`
- `pnpm run test:watch` (watch mode only in `packages/otto`)
- `pnpm run test:coverage` (coverage only in `packages/otto`)
### Fast Quality Gate
- `pnpm run check`
  - Runs workspace `typecheck`, `lint`, `format:check`, extension validation, and tests.

## Package-Scoped Commands
Use `pnpm -C <package> run <script>`.
- `packages/otto`: `dev`, `setup`, `serve`, `telegram-worker`, `start`, `build`, `build:local`, `version:sync`, `extensions:validate`, `check`
- `packages/otto-control-plane`: `dev`, `build`, `start`, `check`
- `packages/otto-extension-sdk`: `build` (informational only), `typecheck`, `lint`, `test`, `format:check`, `check`
- `packages/otto-extensions`: `registry:generate`, `build`, `test` (placeholder script)

## Running a Single Test (Important)
Use `vitest` directly via `pnpm exec` in the target package.
- Core package (`packages/otto`):
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts`
  - `pnpm -C packages/otto exec vitest run tests/path/to/file.test.ts -t "test name"`
  - `pnpm -C packages/otto exec vitest tests/path/to/file.test.ts`
- Control-plane (`packages/otto-control-plane`):
  - `pnpm -C packages/otto-control-plane exec vitest run tests/path/to/file.test.ts`
  - `pnpm -C packages/otto-control-plane exec vitest run tests/path/to/file.test.ts -t "test name"`
  - `pnpm -C packages/otto-control-plane exec vitest tests/path/to/file.test.ts`
- Extension SDK (`packages/otto-extension-sdk`):
  - `pnpm -C packages/otto-extension-sdk exec vitest run tests/path/to/file.test.ts`
  - `pnpm -C packages/otto-extension-sdk exec vitest run tests/path/to/file.test.ts -t "test name"`
Notes:
- Test include glob for active packages is `tests/**/*.test.ts`.
- `packages/otto-extensions` currently has no real tests (`test` prints a message).

## Source Layout Conventions
- `packages/otto/src/**/*.ts` and `packages/otto/tests/**/*.test.ts`
- `packages/otto-control-plane/app/**/*.{ts,tsx,css}` and `packages/otto-control-plane/tests/**/*.test.ts`
- `packages/otto-extension-sdk/src/**/*.ts` and `packages/otto-extension-sdk/tests/**/*.test.ts`
- Keep tests outside `src/` in Node packages (`otto`, `otto-extension-sdk`).

## CLI/Web Parity Rule
- Treat `ottoctl` as the primary product surface.
- When adding/changing `ottoctl` behavior, ship matching control-plane UI/BFF behavior in the same cycle unless explicitly deferred.
- If parity is deferred, document the gap and follow-up plan in `pm/`.

## Code Style Guidelines
### Imports
- Order import groups as:
  1. Node built-ins (`node:*`)
  2. Third-party dependencies
  3. Local imports
- Keep one blank line between groups.
- Prefer `import type` for type-only imports.
- Use explicit `.js` extensions for local ESM TypeScript imports.
### Formatting
- Run package/root scripts instead of ad-hoc formatter commands.
- `packages/otto` and `packages/otto-control-plane` Prettier profile:
  - no semicolons
  - double quotes
  - trailing commas where valid in ES5
  - print width 100
- `packages/otto-extension-sdk` currently follows existing file-local style (semicolons present).
### TypeScript and Types
- `strict` mode is enabled; preserve full type safety.
- Avoid `any`; use only when unavoidable.
- Keep `unknown` at boundaries and narrow before use.
- Prefer explicit exported API types.
- Prefer `zod` for runtime validation + inferred types.
### Naming
- File names: `kebab-case.ts` (except framework-driven route file patterns).
- Variables/functions: `camelCase`.
- Types/interfaces/type aliases: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for derived locals.
- Prefer domain-specific names over generic placeholders.
### Function Design
- Keep functions focused and composable.
- Prefer pure helpers for parse/transform logic.
- Inject side-effect dependencies when practical for testability.
- Add JSDoc on exported functions; describe why behavior exists.
### Error Handling
- Throw actionable, context-rich errors.
- In `catch`, narrow error types before field access.
- Handle expected system errors (`ENOENT`, permission errors) explicitly and rethrow unknown failures.
- For CLI entrypoints, log context and set deterministic exit codes.
### Logging
- Use structured logging (`pino` in core runtime).
- Keep human message text concise; put detail in structured fields.
- Include operational context (`component`, action/command, ids/counts).

## Testing Conventions
- Framework: Vitest.
- Use AAA style (Arrange, Act, Assert) for non-trivial tests.
- Name tests by behavior, not implementation.
- Keep tests deterministic (avoid timing/network flakiness).
- Use temp directories + cleanup hooks for filesystem tests.

## Build and Generated Artifacts
- Core runtime bundle is produced with `tsdown`.
- Core build output lives in `packages/otto/dist`.
- Do not edit generated artifacts (`dist/`, generated registry files) by hand.

## Agent Handoff Checklist
Before finishing work:
1. Run targeted tests for changed areas first.
2. Run package-level checks for touched packages.
3. Run `pnpm run check` when work spans packages/shared behavior.
4. Ensure lint + format checks pass for touched packages.
5. Confirm generated outputs were produced by scripts (not manual edits).

## Cursor and Copilot Rules
Repository scan results:
- `.cursor/rules/` not present
- `.cursorrules` not present
- `.github/copilot-instructions.md` not present

If any of these files are added later, treat them as higher-priority agent instructions and update this guide.
