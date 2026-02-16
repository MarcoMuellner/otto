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
- `dist/`: transpiled JavaScript output
- `tests/`: test suite (outside `src/`)

## Scripts

- `pnpm run dev`: run TypeScript entrypoint in watch-friendly mode
- `pnpm run build`: transpile TypeScript to JavaScript in `dist/`
- `pnpm run start`: run compiled JavaScript from `dist/`
- `pnpm run test`: run Vitest once
- `pnpm run test:watch`: run Vitest in watch mode
- `pnpm run test:coverage`: run tests with V8 coverage report
- `pnpm run lint`: lint `src/` and `tests/` with Oxlint
- `pnpm run format`: format source and config files with Prettier
- `pnpm run check`: full local gate (typecheck + lint + format + tests)

## Getting Started

```bash
pnpm install
pnpm run check
pnpm run build
pnpm run start
```
