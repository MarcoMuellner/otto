# packages/otto-extensions

Catalog package for versioned Otto extensions.

The published remote registry index used by `ottoctl extension ...` lives at:

- `registry/index.json`

Each extension version is packaged as a tarball under:

- `registry/artifacts/<id>-<version>.tgz`

Generate registry artifacts and index from current extension sources:

```bash
pnpm -C packages/otto-extensions run registry:generate
```

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
