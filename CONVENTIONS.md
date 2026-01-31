# CONVENTIONS.md

## Purpose

- This file is the single source of truth for repo conventions beyond tooling defaults.
- Keep it short, concrete, and actionable for coding agents and humans.

## How to update

- Add new conventions as soon as they are agreed upon.
- Prefer explicit examples over long prose.
- When in doubt, ask the maintainer before adding a rule.

## Scope

- Covers coding style, module boundaries, naming, and workflow conventions.
- Does not duplicate tool usage instructions already in `AGENTS.md`.

## Code style

- Match existing patterns in the local file or package before introducing new ones.
- Prefer explicit, named imports over deep/default imports when possible.
- Use per-package absolute import aliases: `@<package>/*` maps to that package's `src/*`.
- Use early returns to avoid deep nesting.
- Keep functions focused; extract helpers when logic grows.

## Types and errors

- Avoid `any`; use `unknown` with runtime validation at boundaries.
- Model nullable values explicitly (`| null` or `| undefined`).
- Throw `Error` with useful context; include `cause` when supported.

## Naming

- `camelCase` for variables/functions, `PascalCase` for types/classes.
- `UPPER_SNAKE_CASE` for module-level constants.
- Use domain-aligned names; avoid abbreviations unless standard.

## Logging and data safety

- Log meaningful events only; never log secrets or PII.
- Treat credentials and tokens as sensitive; do not commit them.

## Tests

- Use deterministic tests; avoid network/time dependencies.
- Name tests by behavior, not implementation details.
- Follow AAA pattern in tests and label Arrange/Act/Assert with comments.
- Package scaffolding baseline: `src/`, `tests/`, `tsconfig.json`, `vitest.config.ts`, and scripts (`lint`, `format`, `test`, `typecheck`).

## Adding new conventions

- If you notice a new convention that is not captured here, ask the user to add it.
- Update this file in the same change set where the convention is introduced.
