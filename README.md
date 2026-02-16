# otto

Otto is a self-hosted personal assistant foundation built with Node.js, TypeScript, and OpenCode.

## Stack

- Node.js >= 22
- ESM modules
- pnpm
- TypeScript (`src/` -> `dist/`)
- Vitest for tests in `tests/` (TDD-first)
- Pino + pino-pretty for structured and beautiful logging
- Oxlint + Prettier for quality gates

## Project Layout

- `src/`: application source code
- `src/assets/`: deployable OpenCode assets (including `opencode.jsonc`)
- `dist/`: transpiled JavaScript output
- `tests/`: test suite (outside `src/`)

## Runtime Config

- Otto config path: `~/.config/otto/config.jsonc`
- The file is auto-created with defaults if it does not exist
- Runtime behavior is file-first: edit this config to customize host/port/workspace

## Install (Release Artifact)

- Stable install (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | bash -s -- --repo <owner>/<repo>
```

- Nightly install:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | bash -s -- --repo <owner>/<repo> --nightly
```

- Installed control binary: `ottoctl`
  - `ottoctl start`
  - `ottoctl stop`
  - `ottoctl update` (defaults to latest stable)
  - `ottoctl update --nightly` (latest nightly)

## Scripts

- `pnpm run setup`: create config/workspace and deploy OpenCode assets into `ottoHome`
- `pnpm run serve`: run the OpenCode server using deployed workspace assets
- `pnpm run dev`: run the server from TypeScript sources
- `pnpm run version:sync`: write `src/version.ts` from explicit value/env/package defaults
- `pnpm run build`: transpile TypeScript to JavaScript in `dist/` and copy assets
- `pnpm run build:local`: sync a local dev version and then build
- `pnpm run start`: run compiled JavaScript server from `dist/`
- `pnpm run test`: run Vitest once
- `pnpm run test:watch`: run Vitest in watch mode
- `pnpm run test:coverage`: run tests with V8 coverage report
- `pnpm run lint`: lint `src/` and `tests/` with Oxlint
- `pnpm run format`: format source and config files with Prettier
- `pnpm run check`: full local gate (typecheck + lint + format + tests)

## Getting Started

```bash
pnpm install
pnpm run setup
pnpm run check
pnpm run build:local
pnpm run start
```
