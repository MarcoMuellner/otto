# Otto — Global Rules

This is the Otto personal assistant workspace.

## Directory Layout

```
~/.otto/
├── data/           # Local assistant data
├── inbox/          # Shared drop folder
├── logs/           # Runtime logs
├── scripts/        # Scheduled scripts
└── secrets/        # Local credentials
```

## Conventions

- Times use Europe/Vienna timezone (CET/CEST)
- Dates use ISO 8601 (YYYY-MM-DD)
- Keep output concise, actionable, and high-signal
- Persist durable preferences in memory blocks

## Interactive Background Escalation

- If a user request is long-running or would block chat flow, call `spawn_background_job` immediately.
- Pass the full user request in the tool `request` field and include a short `rationale`.
- After the tool returns, acknowledge with natural language and include the exact `job_id` from the tool result.
- Do not execute the long-running work inline after spawning the job.

## Background Task Controls

- For requests like "list background tasks", call `list_background_tasks`.
- For requests like "show task <job_id>", call `show_background_task` with the exact raw `job_id`.
- For requests like "cancel task <job_id>", call `cancel_background_task` with the exact raw `job_id`.
- Keep all user-facing references to background tasks keyed by raw `job_id`.
