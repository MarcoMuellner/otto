# AGENTS.md

## Purpose

- This repo uses a pnpm workspace with a single package today.
- Use this guide to run checks and follow local style when editing.

## Quick facts

- Workspace root: `package.json` with shared scripts.
- Tooling: `pnpm`, `prettier`, `oxlint`, `vitest` for all packages.
- Docs: `basic_requirements/` and `README.md`.
- Scripts: root uses `pnpm -r`

## Project summary (from `basic_requirements/`)

- Otto is a self-hosted personal assistant that takes action, not just chat.
- Core principles: secure-by-default, proactive, self-aware, user-controlled, channel-agnostic.
- Architecture: server-client with Gateway, Agent (LLM), Storage (SQLite + vectors), Scheduler, Sandbox, Integrations.
- Channels: WhatsApp first (Baileys), future Telegram/Signal/WebChat; channels normalize messages.
- Integrations use MCP-style tools; Gmail/Calendar/Tasks are V1 targets with autonomy tiers.
- Autonomy tiers: 1 autonomous, 2 confirm first, 3 always ask (destructive actions).
- Security: explicit file access only, sandboxed execution, auth + allowlist pairing, audit trail for all actions.
- Data: conversation history, user profile, RAG embeddings, config, audit log in SQLite.
- LLM provider is user-configured (OpenAI/Mistral/Ollama/Anthropic); local models are supported.
- Hardware target: Raspberry Pi-class devices; aim for low memory and reliable 24/7 uptime.

IMPORTANT!!: Conventions are centralized in `CONVENTIONS.md`. If you discover a new convention that is not documented there, pause and ask the user to add it to `CONVENTIONS.md` before you proceed.

## Install

- Install deps from the repo root: `pnpm install`.
- Use the workspace filter for package scripts: `pnpm --filter <package> <script>`.
- Alternative: `pnpm -C packages/<package> <script>` if you prefer per-package cwd.

## Build

- No build step is defined yet.
- If you add a build, wire it into `package.json` scripts at root and package.

## Lint

- Run all workspace lint tasks: `pnpm lint`.
- Lint a package only: `pnpm --filter <package> lint`.
- Lint a specific folder: `pnpm --filter <package> lint -- src/` (oxlint arg pass-through).

## Format

- Format all workspace packages: `pnpm format`.
- Format a package only: `pnpm --filter <package> format`.
- Check formatting only: `pnpm --filter @otto/server format:check`.

## Test

- Run all tests: `pnpm test`.
- Run tests for a package: `pnpm --filter <package> test`.
- Watch mode: `pnpm --filter <package> test:watch`.

## Single test (Vitest)

- Run a single test file: `pnpm --filter <package> test -- path/to/file.test.ts`.
- Run tests matching a name: `pnpm --filter <package> test -- -t "test name"`.
- Run a single suite in watch mode: `pnpm --filter <package> test:watch -- -t "suite name"`.

## General editing principles

- Match existing patterns in the file or directory before introducing new ones.
- Keep changes small, focused, and consistent with current tooling.
- Prefer straightforward solutions over clever abstractions.
- Avoid introducing new dependencies unless clearly necessary.

## Formatting

- Prettier is the formatter; do not hand-format to different styles.
- Run `pnpm --filter <package> format` after structural edits.
- Avoid mixing tabs/spaces; let Prettier normalize.

## Linting

- `oxlint` is the linter; keep code free of lint warnings.
- Fix lint issues locally rather than disabling rules.
- If a suppression is required, keep the narrowest scope and explain why.

## Imports

- Prefer explicit, named imports over deep/default imports when possible.
- Group imports by: Node built-ins, external deps, internal modules, relative modules.
- Keep import order stable; sort alphabetically within each group if no local pattern exists.
- Avoid circular imports; refactor module boundaries if needed.
- When installing new dependencies, always use pnpm to install, do not directly edit `package.json`.

## Modules and file organization

- Keep modules single-purpose; split when a file grows beyond a few hundred lines.
- Prefer flat, small modules over nested export barrels unless consistent with area.
- Avoid index re-export chains that hide ownership of code.

## Types and typing (JS/TS)

- Use explicit types for public APIs and exported functions.
- Keep inferred types for local variables when obvious.
- Avoid `any`; prefer `unknown` with runtime validation.
- Model nullable values explicitly (`| null` or `| undefined`).
- For union types, use discriminated unions when possible.

## Naming conventions

- `camelCase` for variables, functions, and object properties.
- `PascalCase` for classes, types, interfaces, and React components (if added).
- `UPPER_SNAKE_CASE` for module-level constants.
- Use clear, domain-aligned names; avoid abbreviations unless standard.
- File/folder names: follow local convention; default to `kebab-case` if none.

## Functions and control flow

- Keep functions focused; favor early returns over deep nesting.
- Prefer pure functions for logic and keep side effects at boundaries.
- Use small helpers rather than long inline anonymous callbacks.

## Error handling

- Throw `Error` (or subclasses) with useful context.
- Do not swallow errors; log and rethrow or return a typed error result.
- When catching, include the original error as `cause` when supported.
- Validate external inputs at boundaries (request payloads, env vars, file IO).

## Logging

- Log meaningful events, not noise; avoid logging secrets or PII.
- Logging should generally be done via PinoJs; avoid custom loggers and console.log.
- Ask the user to install PinoJs if you want to log something - then set it up if it isn't already.
- Keep log messages structured and actionable.

## Tests

- Use Vitest in a dedicated `tests/` folder.
- Prefer deterministic tests; avoid time-dependent or network-dependent tests.
- Name tests to describe behavior, not implementation.
- Use `describe` blocks to group behavior, not helpers.
- Keep unit tests small; use fixtures/helpers for repeated setup.

## Comments and docs

- Comment only when the "why" is not obvious from code.
- Keep README and architecture notes updated when behavior changes.
- Use Markdown for new docs; keep them concise.

## Future additions

- Add tools at workspace root unless a package-only need exists.
- Keep versions pinned in `package.json` and update `pnpm-lock.yaml`.
- If adding build scripts, wire `build`/`build:watch` at root and package, and document outputs.
- If adding TypeScript, add `tsconfig.json` per package and update lint/format coverage.

## Cursor/Copilot rules

- No `.cursor/rules`, `.cursorrules`, or `.github/copilot-instructions.md` found.
- If such rules are added later, summarize them here.
