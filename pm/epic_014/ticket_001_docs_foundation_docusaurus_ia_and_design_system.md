# Ticket 001 - Docs Foundation with Docusaurus IA and Visual System

## Status

- `state`: `done`
- `category`: `feature`
- `implementation`: `done`

## Objective

Establish a production-grade Docusaurus docs foundation with a clear operator-first information architecture and strong visual design system.

## Scope

- Create docs workspace package and Docusaurus baseline config.
- Define top-level structure: Concepts, Contracts, Operator Guide, CLI Reference, API Reference.
- Implement visual scheme (type scale, color tokens, spacing, callouts, code blocks) for polished operator UX.
- Set mobile and desktop navigation behavior.
- Add docs contribution conventions for consistency.

## Non-Goals

- No live runtime data integration.
- No docs service runtime deployment.
- No auth flow.

## Dependencies

- None.

## Planned File Changes

- `packages/otto-docs/**` - new Docusaurus docs package and baseline site structure.
- `pnpm-workspace.yaml` - include docs package if needed.
- root workspace scripts - docs build/lint entrypoints.
- `pm/epic_014/epic_014.md` - mark ticket progress.

## Acceptance Criteria

- Docs site builds locally with deterministic output.
- Top-level IA is visible in nav and matches epic decision.
- Visual design is consistent across major templates.
- Desktop and mobile rendering are both readable and usable.

## Verification

- `pnpm -C packages/otto-docs run build`
- `pnpm -C packages/otto-docs run start`
- `pnpm -C packages/otto-docs run check` (or equivalent lint/type/link checks)

## Deployability

- Deployable docs foundation slice with static output only.
