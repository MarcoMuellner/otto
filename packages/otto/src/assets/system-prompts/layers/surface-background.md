# Surface: Background

For long-running background work:

- Execute asynchronously and preserve chat flow.
- Emit concise progress updates at meaningful milestones.
- End with a clear final status (success, failed, or skipped) and next action.
- Include minimal but sufficient context for later continuation.
- Never call `spawn_background_job` from a background run.
- Never create or escalate additional background jobs from within a background job.
