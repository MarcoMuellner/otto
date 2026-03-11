# OpenCode Terminal Reference

This reference backs the `opencode-terminal` skill.

## Source baseline

- `Intro | OpenCode` - https://opencode.ai/docs/
- `CLI | OpenCode` - https://opencode.ai/docs/cli/
- `TUI | OpenCode` - https://opencode.ai/docs/tui/
- `Config | OpenCode` - https://opencode.ai/docs/config/
- `Rules | OpenCode` - https://opencode.ai/docs/rules/
- `Agents | OpenCode` - https://opencode.ai/docs/agents/
- `Tools | OpenCode` - https://opencode.ai/docs/tools/
- `Permissions | OpenCode` - https://opencode.ai/docs/permissions/
- `Commands | OpenCode` - https://opencode.ai/docs/commands/
- `Agent Skills | OpenCode` - https://opencode.ai/docs/skills/
- `Share | OpenCode` - https://opencode.ai/docs/share/
- Local runtime checks from:
  - `opencode --version`
  - `opencode --help`
  - `opencode run --help`
  - `opencode session --help`
  - `opencode debug --help`
  - `opencode db --help`
  - `opencode pr --help`

## Installed runtime snapshot used for this extension

- OpenCode version observed during authoring: `1.2.24`

## Mode map

| Goal | Best interface | Command |
| --- | --- | --- |
| Interactive project work | TUI | `opencode` |
| Interactive work in a specific repo | TUI | `opencode /path/to/project` |
| One-shot prompt | CLI | `opencode run "..."` |
| Reuse backend for many calls | Headless server + CLI | `opencode serve` + `opencode run --attach ...` |
| Remote TUI to running backend | Attach | `opencode attach http://host:port` |
| Browser UI | Web | `opencode web` |

## High-value CLI commands

```bash
opencode --help
opencode --version
opencode auth login
opencode auth list
opencode models
opencode models --refresh
opencode run "Explain this repository"
opencode run --format json "Summarize the diff"
opencode serve
opencode attach http://localhost:4096
opencode session list
opencode export
opencode import ./session.json
opencode stats
opencode debug config
opencode debug skill
opencode debug paths
```

## TUI quick reference

Inside the TUI:

- `@file` - fuzzy include a file in the prompt
- `!command` - run shell and inject output
- `/command` - run a slash command
- `Tab` - cycle primary agents

High-value slash commands:

- `/connect`
- `/models`
- `/init`
- `/sessions`
- `/compact`
- `/details`
- `/editor`
- `/new`
- `/share`
- `/unshare`
- `/undo`
- `/redo`
- `/themes`

Selected leader-key defaults from docs:

- `ctrl+x c` - compact
- `ctrl+x d` - details
- `ctrl+x e` - editor
- `ctrl+x h` - help
- `ctrl+x i` - init
- `ctrl+x l` - sessions
- `ctrl+x m` - models
- `ctrl+x n` - new session
- `ctrl+x q` - exit
- `ctrl+x r` - redo
- `ctrl+x s` - share
- `ctrl+x t` - themes
- `ctrl+x u` - undo
- `ctrl+x x` - export

## Config paths

Global:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/tui.json`
- `~/.config/opencode/AGENTS.md`
- `~/.config/opencode/agents/`
- `~/.config/opencode/commands/`
- `~/.config/opencode/skills/`
- `~/.config/opencode/tools/`
- `~/.config/opencode/themes/`

Project:

- `opencode.json`
- `tui.json`
- `AGENTS.md`
- `.opencode/agents/`
- `.opencode/commands/`
- `.opencode/skills/`
- `.opencode/tools/`
- `.opencode/themes/`

Provider auth data:

- `~/.local/share/opencode/auth.json`

## Config precedence

Later layers override earlier ones for conflicts, but configs are merged.

1. Remote org config
2. Global config
3. `OPENCODE_CONFIG`
4. Project `opencode.json`
5. `.opencode/` directory content
6. `OPENCODE_CONFIG_CONTENT`

Separate TUI path override:

- `OPENCODE_TUI_CONFIG`

## Safety reminders

- Sharing is public until `/unshare`.
- `/undo` and `/redo` need a Git repo.
- Permissions default to permissive behavior unless tightened.
- `.env` reads are denied by default except `.env.example`.
- `external_directory` access asks by default.
- Non-interactive shell environments should prefer `opencode run` over trying to drive the TUI.

## Useful troubleshooting commands

```bash
opencode debug config
opencode debug paths
opencode debug skill
opencode debug agent build
opencode auth list
opencode models --refresh
opencode mcp list
opencode session list
opencode db path
opencode db 'select name from sqlite_master where type = "table";'
```

## Known drift points

- Current docs describe built-in workflows accurately at a high level, but command inventories can change.
- Current local help exposes commands like `debug`, `db`, and `pr` that are easy to miss if you only rely on older examples.
- Permission docs are the source of truth for `permission`; older material may still refer to the legacy `tools` boolean controls.
