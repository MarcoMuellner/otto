---
id: prompt
title: Prompt Command
description: Open interactive prompt picker and edit user-owned prompt files safely.
---

## Command

- `ottoctl prompt`

## Behavior

- Opens an interactive picker in TTY terminals.
- Lists system and user prompt files.
- Allows editing only user-owned prompt files.
- Blocks direct edits to system-owned prompt files and prints the user-owned
  equivalent path to edit.
- At runtime, matching user layer files are appended after system layer files
  (`system + user`).

## Internal Tools

- OpenCode runtime tools can list/read/write managed prompt files through
  internal APIs.
- Prompt writes from tools require explicit confirmation.
- Write operations are restricted to user-owned prompt files under `~/.otto/prompts`.

## Prompt Paths

- System prompts: `~/.otto/system-prompts`
- User prompts: `~/.otto/prompts`

## Example

```bash
ottoctl prompt
```

## Failure Modes

- Non-interactive terminals return a TTY requirement error.
- Missing editor binaries return guidance to set `$EDITOR` or `$VISUAL`.
