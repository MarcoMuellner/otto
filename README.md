# otto workspace

This repository is a pnpm workspace with two packages:

- `packages/otto`: Otto core runtime, CLI, build, and release artifacts
- `packages/otto-extensions`: extension catalog scaffolding (tools, skills, MCP, overlays)

## Common Commands

- `pnpm run check`
- `pnpm run build`
- `pnpm run test`

These root scripts proxy to package-level scripts and preserve prior operator workflow.

## Contributor Notes

- Core runtime implementation and release artifacts live in `packages/otto`.
- Extension catalog scaffolding lives in `packages/otto-extensions`.
- Use root commands during development (`pnpm run check`, `pnpm run build`, `pnpm run test`) to run the canonical workspace flow.

## Install Entrypoint

The installer remains available at the repository root for compatibility:

```bash
curl -fsSL https://raw.githubusercontent.com/MarcoMuellner/otto/main/install.sh | bash
```

The root installer delegates to `packages/otto/install.sh` internally.
