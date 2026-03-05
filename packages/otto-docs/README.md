# otto-docs

Docusaurus-based operator documentation foundation for Otto.

## Commands

- `pnpm -C packages/otto-docs run dev`
- `pnpm -C packages/otto-docs run start`
- `pnpm -C packages/otto-docs run build`
- `pnpm -C packages/otto-docs run lint`
- `pnpm -C packages/otto-docs run check`

## Information Architecture

- Concepts
- Contracts
- Operator Guide
- CLI Reference
- API Reference

## Notes

- This package provides static docs foundation only.
- Live runtime docs integration is out of scope for ticket 001.

## Release Version Metadata

- Release builds read `OTTO_DOCS_VERSION` and `OTTO_DOCS_TAG` from environment.
- Release builds read `OTTO_DOCS_SITE_URL` and `OTTO_DOCS_BASE_URL`
  to bind absolute links.
- GitHub Pages release artifacts include immutable tagged docs at
  `/<tag>/` plus `versions.json`.
