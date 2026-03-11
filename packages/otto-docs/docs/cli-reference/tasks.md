---
id: tasks
title: Task Commands
description: Manage task profiles, task state, audit visibility, and immediate task execution.
---

Task commands operate on Otto state in `~/.otto/data/otto-state.db` and task
profile files in `~/.otto/task-config/profiles`.

Built-in profiles include `general-reminder`, `email-triage`, and `eod-learning`
for nightly End-of-Day learning runs.

Built-in system task id for self-learning: `system-daily-eod-learning`.

## Profiles

- `ottoctl task profiles list`
- `ottoctl task profiles validate [profile-id]`
- `ottoctl task profiles install <profile-file.jsonc>`

## Task State

- `ottoctl task list`
- `ottoctl task show <task-id>`
- `ottoctl task bind-profile <task-id> <profile-id>`
- `ottoctl task run-now <task-id>`

## Audit and Model Binding

- `ottoctl task audit [limit]`
- `ottoctl task set-model <task-id> <provider/model|inherit>`

`task set-model` is forwarded to model CLI behavior.

## Notable Constraints

- `task audit [limit]` accepts integer limits between `1` and `200`.
- `task run-now` fails for paused tasks.
- Task/profile identifiers must exist; missing resources fail with non-zero exit.

For immediate self-learning execution (without waiting for midnight):

```bash
ottoctl task run-now system-daily-eod-learning
```

## Examples

```bash
ottoctl task profiles list
ottoctl task profiles validate
ottoctl task profiles install ./my-profile.jsonc

ottoctl task list
ottoctl task show daily-brief
ottoctl task bind-profile daily-brief calm-style
ottoctl task run-now daily-brief

ottoctl task audit 100
ottoctl task set-model daily-brief openai/gpt-5-mini
```

## Verification

- Confirm task rows are listed/updated as expected.
- Use `ottoctl task audit` to inspect command/task audit records after changes.
