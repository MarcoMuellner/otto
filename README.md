# otto workspace

This repository is a pnpm workspace with two packages:

- `packages/otto`: Otto core runtime, CLI, build, and release artifacts
- `packages/otto-extensions`: extension catalog scaffolding (tools, skills, MCP, overlays)

## Common Commands

- `pnpm run check`
- `pnpm run build`
- `pnpm run test`

These root scripts proxy to package-level scripts and preserve prior operator workflow.

## Install Entrypoint

The installer remains available at the repository root for compatibility:

```bash
curl -fsSL https://raw.githubusercontent.com/MarcoMuellner/otto/main/install.sh | bash
```

The root installer delegates to `packages/otto/install.sh` internally.
