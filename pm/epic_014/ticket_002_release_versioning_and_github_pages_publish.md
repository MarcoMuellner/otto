# Ticket 002 - Versioned Docs Build and GitHub Pages Publish

## Status

- `state`: `planned`
- `category`: `feature`

## Objective

Publish static docs per release tag to GitHub Pages with deterministic version binding and a stable `latest` alias.

## Scope

- Add versioned docs build pipeline for tagged releases.
- Produce and publish static docs artifact to GitHub Pages.
- Ensure docs version metadata maps to release tag.
- Add release-time validation checks for docs artifact integrity.

## Non-Goals

- No live runtime docs views.
- No docs service deployment integration.
- No token-authenticated endpoints.

## Dependencies

- `pm/epic_014/ticket_001_docs_foundation_docusaurus_ia_and_design_system.md`

## Planned File Changes

- `.github/workflows/**` - docs release and publish workflow changes.
- `packages/otto-docs/**` - versioning config, manifest generation, static output handling.
- release scripts under `scripts/**` as needed for docs artifact wiring.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Tagged release builds publish corresponding docs version.
- `latest` docs pointer resolves to current stable release.
- Public docs output contains no live runtime data hooks.
- Build logs include release version to docs version mapping.

## Verification

- Run docs release workflow in CI for a test tag.
- Validate generated artifact routes and version manifest.
- Open GitHub Pages URL for `latest` and one tagged version.

## Deployability

- Deployable public docs publishing increment independent of runtime service rollout.
