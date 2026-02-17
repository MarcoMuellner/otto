# packages/otto-extensions

Catalog package for versioned Otto extensions.

## Layout

- `extensions/<id>/manifest.jsonc`
- optional payload folders/files (`tools/`, `skills/`, `mcp.jsonc`, overlays)

See `CONTRACT.md` for the full extension contract.

## Validation

From workspace root:

```bash
pnpm run extensions:validate
```

Validation contract logic is implemented in `packages/otto-extension-sdk` and invoked through the `packages/otto` CLI wrapper script.
