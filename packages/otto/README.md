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
- Telegram worker credentials are stored in `~/.local/share/otto/secrets/telegram.env` and managed by `ottoctl configure-telegram`
- Service runtime env vars are stored in `~/.local/share/otto/secrets/runtime.env` and loaded on boot (systemd `EnvironmentFile`, launchd plist environment)
- Manage runtime env vars with `ottoctl env set <KEY> <VALUE>`, `ottoctl env unset <KEY>`, and `ottoctl env list`
- Telegram worker runtime defaults (heartbeat, retries, prompt timeout, OpenCode bridge URL) are fixed by runtime code and no longer configured through env vars
- Telegram voice/transcription settings live in `~/.config/otto/config.jsonc` under `telegram.voice` and `telegram.transcription`; local installs use provider `worker` so Faster-Whisper stays loaded in a background process during Otto runtime
- `ottoctl configure-voice-transcription` attempts one-shot local provisioning via `scripts/install-parakeet-v3.sh` (Python venv + Faster-Whisper model cache) and falls back safely when auto-provisioning is unavailable
- Internal API env (optional): `OTTO_INTERNAL_API_HOST` (default `127.0.0.1`, loopback only), `OTTO_INTERNAL_API_PORT` (default `4180`)
- External API env (optional): `OTTO_EXTERNAL_API_HOST` (default `0.0.0.0`), `OTTO_EXTERNAL_API_PORT` (default `4190`)
- Internal API token: persisted in `~/.otto/secrets/internal-api.token` and exported at runtime as `OTTO_INTERNAL_API_URL` + `OTTO_INTERNAL_API_TOKEN` for OpenCode tools
- External API token: reuses `~/.otto/secrets/internal-api.token`; runtime exports `OTTO_EXTERNAL_API_URL`
- API boundary: `/internal/*` is OpenCode-tool/internal runtime integration, `/external/*` is authenticated LAN-facing control-plane/app integration
- External jobs read endpoints currently exposed: `GET /external/jobs?lane=scheduled`, `GET /external/jobs/:id`, `GET /external/jobs/:id/audit`, `GET /external/jobs/:id/runs`, `GET /external/jobs/:id/runs/:runId`
- Otto orchestration state database: `~/.otto/data/otto-state.db`
- Extension store root: `~/.otto/extensions/store/<id>/<version>`
- Extension activation state file: `~/.otto/extensions/state.json`
- Extension registry index default: `https://raw.githubusercontent.com/MarcoMuellner/otto/main/packages/otto-extensions/registry/index.json`
- Extension registry override env (optional): `OTTO_EXTENSION_REGISTRY_URL`
- `ottoctl extension install/update` retains one installed version per extension id by pruning older versions
- `ottoctl extension install/update` immediately activates extension tools and skills into `~/.otto/.opencode`
- `ottoctl extension disable` removes the installed extension footprint (runtime + store)
- `ottoctl update` prompts for Telegram credentials when missing and stores them at `~/.local/share/otto/secrets/telegram.env` (skip is allowed)
- Control-plane service bind env (optional): `OTTO_CONTROL_PLANE_HOST` (default `0.0.0.0`), `OTTO_CONTROL_PLANE_PORT` (default `4173`)

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
  - `ottoctl restart`
  - `ottoctl stop`
  - `ottoctl configure-telegram` (interactive Telegram credential setup, skippable)
  - `ottoctl configure-voice-transcription` (interactive local Faster-Whisper setup, best-effort and skippable)
  - `ottoctl env list|path|set|unset` (manage service boot-time environment variables)
  - `ottoctl task profiles list`
  - `ottoctl task profiles validate [profile-id]`
  - `ottoctl task profiles install <profile-file.jsonc>`
  - `ottoctl task list`
  - `ottoctl task bind-profile <task-id> <profile-id>`
  - `ottoctl task show <task-id>`
  - `ottoctl task audit [limit]`
  - `ottoctl heartbeat status` (show current heartbeat delivery mode)
  - `ottoctl heartbeat mode <observe|mute>` (observe = always compact updates, mute = suppress normal heartbeats)
  - `ottoctl extension list`
  - `ottoctl extension install <id>[@version]` (default installs latest registry version)
  - `ottoctl extension update <id>`
  - `ottoctl extension update --all`
  - `ottoctl extension disable <id>`
  - `ottoctl extension remove <id>[@version]`
  - `ottoctl update` (defaults to latest stable)
  - `ottoctl update --nightly` (latest nightly)
  - `ottoctl update --repo <owner>/<repo>` (optional override for custom repo)
- `ottoctl start|restart|stop` manage both runtime (`otto`) and control-plane (`otto-control-plane`) services when control-plane artifact is present in the installed release.

## Scripts

- `pnpm run setup`: create config/workspace and deploy OpenCode assets into `ottoHome`
- `pnpm run serve`: run OpenCode + internal API and auto-start Telegram worker when credentials are configured
- Control-plane web UI runs as a separate process from `packages/otto-control-plane` (for example `pnpm -C packages/otto-control-plane run dev`)
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
