# 1Password Skill Extension

This extension adds a 1Password CLI skill for secure secret workflows.

## Included skill

- `onepassword`

## Prerequisites

- 1Password CLI (`op`) installed and on PATH
- `tmux` installed on the host
- 1Password desktop app available/unlocked for sign-in approval (recommended)

Official docs:

- https://developer.1password.com/docs/cli/get-started/

## Install

```bash
ottoctl extension install onepassword
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart to refresh skill discovery:

```bash
ottoctl stop
ottoctl start
```

## Verify

- Skill file exists at `~/.otto/.opencode/skills/onepassword/SKILL.md`.

## Notes

- The skill requires `op` commands to run inside tmux because Otto shell executions are non-interactive and do not persist a TTY between calls.
