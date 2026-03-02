# Epic 013 - Scheduler Session Deadlock Bugfix

## Status

- `id`: `epic_013`
- `type`: epic ticket
- `category`: `bugfix`
- `state`: `planned`
- `goal`: prevent scheduled task runs from getting stuck on interactive tool calls and repeatedly failing with `fetch failed` due to stale bound OpenCode sessions.

## Why

We hit a production failure where a scheduled Home Assistant task entered a deadlocked OpenCode session after a `question` tool call remained `running`. Because scheduled tasks reuse a bound session, all later runs for that job failed until the session and binding were manually cleared.

## Decisions Locked In

- Scheduled/background execution must be non-interactive.
- Scheduler prompts must never rely on `question` tool responses.
- If a bound session is unhealthy or unresolved, scheduler must auto-heal by rotating to a fresh session.
- Recovery behavior must be deterministic and observable in logs and run history.
- Keep the fix local to scheduler/session orchestration; no control-plane feature work in this epic.

## Success Criteria

- Scheduled jobs cannot deadlock on `question` tool usage.
- A single stale session cannot poison all future runs for a job.
- Failure mode is explicit in logs/run results and triggers safe rebind behavior.
- Existing scheduled jobs continue to run without manual intervention.

## Delivery Plan (Deployable Tickets)

1. `ticket_001`: Scheduler non-interactive guard and stale-session auto-recovery.

## Out of Scope

- New scheduler UX in Telegram or control-plane.
- Changes to interactive chat behavior.
- Broader retry policy redesign across unrelated failure classes.
