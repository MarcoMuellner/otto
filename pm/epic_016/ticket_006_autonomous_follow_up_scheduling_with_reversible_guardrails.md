# Ticket 006 - Autonomous Follow-Up Scheduling with Reversible Guardrails

## Status

- `state`: `done`
- `category`: `feature`

## Objective

Enable EOD learning runs to create autonomous follow-up tasks when high-confidence improvements are reversible and have explicit expected value.

## Scope

- Parse follow-up action proposals from EOD decision output.
- Enforce action policy: reversible-only, confidence `>=0.8`, expected value present.
- Create scheduled tasks through existing task mutation services.
- Add dedupe/fingerprint checks to avoid repetitive duplicate follow-ups.
- Persist accepted/rejected scheduling decisions in EOD action records.

## Non-Goals

- No hard numeric cap on follow-up creation.
- No new external integrations beyond current task scheduler.

## Dependencies

- `ticket_005` (decision output and apply pipeline).

## Planned File Changes

- `packages/otto/src/scheduler/eod-learning/follow-up-actions.ts` - action validation + scheduling.
- `packages/otto/src/api-services/tasks-mutations.ts` - integration hook if required.
- `packages/otto/tests/scheduler/eod-learning-follow-up.test.ts` - policy and dedupe tests.
- `pm/epic_016/epic_016.md` - progress tracking.

## Acceptance Criteria

- High-confidence reversible actions are schedulable from EOD run output.
- Irreversible or low-confidence actions are rejected and persisted with reasons.
- Duplicate proposals across adjacent runs are deduped deterministically.
- Created follow-up tasks are traceable back to originating EOD run/action record.

## Verification

- `pnpm -C packages/otto exec vitest run tests/scheduler/eod-learning-follow-up.test.ts`
- `pnpm -C packages/otto run check`

## Deployability

- Deployable value increment: Otto can autonomously operationalize validated learnings into scheduled work.
