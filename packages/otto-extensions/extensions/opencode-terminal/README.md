# OpenCode Terminal Extension

This extension adds a terminal-operations skill for OpenCode itself.

## What this installs

- Skill: `opencode-terminal`
- Reference bundle: `references/terminal-reference.md`

## Install

```bash
ottoctl extension install opencode-terminal
```

Install activates immediately in the runtime footprint.

If Otto is already running, restart the service so OpenCode reloads skills:

```bash
ottoctl stop
ottoctl start
```

## Verify

- Check skill exists at `~/.otto/.opencode/skills/opencode-terminal/SKILL.md`.
- Check reference bundle exists at `~/.otto/.opencode/skills/opencode-terminal/references/terminal-reference.md`.

## What the skill covers

- Installing and upgrading OpenCode
- Auth, models, and provider setup
- TUI commands, slash commands, and key flows
- Non-interactive `opencode run` usage
- Config locations, precedence, and customization
- Sessions, sharing, attach/serve workflows, and troubleshooting

## Source baseline

The skill was written from:

- OpenCode official docs on `opencode.ai/docs`
- Local CLI help from `opencode --help` and related subcommand help

Treat local CLI help as the runtime source of truth if docs and installed behavior drift.
