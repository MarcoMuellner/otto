# Ticket 002 - Extension Manifest and Catalog Contract

## Objective

Define extension manifest schema and catalog layout so extensions are validated and discoverable before install/enable logic is introduced.

## Why

Installable capability bundles need deterministic structure to avoid ad-hoc extension shape drift.

## Scope

- Define `manifest.jsonc` schema (Zod) for extension metadata and payload declarations.
- Define catalog layout in `packages/otto-extensions/extensions/<id>/`.
- Support optional extension payload sections:
  - tools
  - skills
  - MCP config
  - OpenCode/task-config overlay fragments
- Add catalog loader/validator utility in core package.
- Seed 1-2 internal example extensions for contract validation.

## Non-Goals

- Persisting extension install state.
- Enabling extension assets at runtime.

## Dependencies

- `ticket_001`.

## Acceptance Criteria

- Invalid manifests fail with actionable diagnostics.
- Duplicate extension ids/versions in catalog are rejected.
- Catalog discovery can enumerate installable extensions with metadata.

## Verification

- Unit tests for manifest schema and loader validation.
- Fixture tests for malformed/valid extension definitions.

## Deployability

- Deployable contract layer with no active runtime behavior changes.
