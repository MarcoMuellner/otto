# otto workspace

This repository is a pnpm workspace with two packages:

- `packages/otto`: Otto core runtime, CLI, build, and release artifacts
- `packages/otto-extensions`: extension catalog scaffolding (tools, skills, MCP, overlays)

## Common Commands

- `pnpm run check`
- `pnpm run build`
- `pnpm run test`

These root scripts proxy to package-level scripts and preserve prior operator workflow.
