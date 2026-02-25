9# Ticket 001 - Background Job Contract and Escalation Hook

## Status

- `state`: `done`

## Objective

Introduce a dedicated interactive background one-shot job contract and wire model-directed auto-escalation from the interactive lane.

## Scope

- Add background job type namespace (for example `interactive_background_oneshot`).
- Define/validate payload shape for escalated requests.
- Add escalation handling in interactive lane:
  - create background job
  - send immediate natural-language acknowledgment with `job_id`
  - end inline turn
- Keep non-escalated path unchanged.

## Non-Goals

- Heuristic classifier outside prompt policy.
- Recurring background job support.
- Feature flags or rollout toggles.

## Dependencies

- None.

## Acceptance Criteria

- Escalated interactive request creates a job row with the new background type.
- Ack message is emitted immediately and includes the created `job_id`.
- Inline turn ends after ack when escalated.
- Non-escalated requests continue existing inline behavior without regression.

## Verification

- Targeted tests:
  - `pnpm -C packages/otto exec vitest run tests/**/interactive*`
  - `pnpm -C packages/otto exec vitest run tests/**/scheduler*`
- Package quality gate:
  - `pnpm -C packages/otto run check`

## Deployability

- Deployable behind normal runtime start; no schema migration required for MVP.
