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
- `src/assets/.opencode/`: shipped OpenCode local tools and tool runtime dependencies
- `src/assets/task-config/`: deployable task runtime base config and task profiles
- `dist/`: transpiled JavaScript output
- `tests/`: test suite (outside `src/`)

## Runtime Config

- Otto config path: `~/.config/otto/config.jsonc`
- The file is auto-created with defaults if it does not exist
- Runtime behavior is file-first: edit this config to customize host/port/workspace
- Pretty terminal logs are opt-in via `OTTO_PRETTY_LOGS=1` (default runtime logging is structured and deployment-safe)
- Telegram worker security env (required when worker is enabled): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`
- Telegram worker bridge env (optional): `OTTO_OPENCODE_BASE_URL` (default `http://127.0.0.1:4096`), `OTTO_TELEGRAM_PROMPT_TIMEOUT_MS` (default `120000`)
- Telegram outbound queue env (optional): `OTTO_TELEGRAM_OUTBOUND_POLL_MS` (default `2000`), `OTTO_TELEGRAM_OUTBOUND_MAX_ATTEMPTS` (default `5`), `OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS` (default `5000`), `OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS` (default `300000`)
- Internal API env (optional): `OTTO_INTERNAL_API_HOST` (default `127.0.0.1`, loopback only), `OTTO_INTERNAL_API_PORT` (default `4180`)
- Internal API token: persisted in `~/.otto/secrets/internal-api.token` and exported at runtime as `OTTO_INTERNAL_API_URL` + `OTTO_INTERNAL_API_TOKEN` for OpenCode tools
- Otto orchestration state database: `~/.otto/data/otto-state.db`
- `ottoctl update` prompts for Telegram credentials when missing and stores them at `~/.local/share/otto/secrets/telegram.env` (skip is allowed)

## Install (Release Artifact)

- Release artifacts are bundled for Node runtime use, so install/update does not run package manager installs on the target machine.

- Stable install (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/MarcoMuellner/otto/main/install.sh | bash
```

- Nightly install:

```bash
curl -fsSL https://raw.githubusercontent.com/MarcoMuellner/otto/main/install.sh | bash -s -- --nightly
```

- Installing from a fork/other repository (optional):

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/install.sh | bash -s -- --repo <owner>/<repo>
```

- Installed control binary: `ottoctl`
  - `ottoctl start`
  - `ottoctl stop`
  - `ottoctl configure-telegram` (interactive Telegram credential setup, skippable)
  - `ottoctl task profiles list`
  - `ottoctl task profiles validate [profile-id]`
  - `ottoctl task profiles install <profile-file.jsonc>`
  - `ottoctl task bind-profile <task-id> <profile-id>`
  - `ottoctl task show <task-id>`
  - `ottoctl update` (defaults to latest stable)
  - `ottoctl update --nightly` (latest nightly)
  - `ottoctl update --repo <owner>/<repo>` (optional override for custom repo)

## Scripts

- `pnpm run setup`: create config/workspace and deploy OpenCode assets into `ottoHome`
- `pnpm run serve`: run OpenCode + internal API and auto-start Telegram worker when credentials are configured
- `pnpm run telegram-worker`: run the dedicated Telegram worker runtime
- `pnpm run dev`: run the server from TypeScript sources
- `pnpm run version:sync`: write `src/version.ts` from explicit value/env/package defaults
- `pnpm run build`: bundle runtime with tsdown into `dist/` and copy assets
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
