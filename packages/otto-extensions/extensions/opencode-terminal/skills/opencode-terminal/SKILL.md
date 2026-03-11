---
name: opencode-terminal
description: Use OpenCode correctly in the terminal, including install, auth, config, TUI workflows, non-interactive CLI usage, and troubleshooting.
license: MIT
compatibility: opencode
metadata:
  tool: opencode
  audience: operators
---

# OpenCode Terminal Skill

Use this skill when the task is about OpenCode itself in a terminal context: installing it, configuring it, choosing models, using the TUI, running `opencode run`, managing sessions, creating `AGENTS.md`, adding commands, agents, skills, or debugging why OpenCode is not behaving as expected.

Do not load this skill for normal repo coding tasks that only happen to be done inside OpenCode. Load it when the user wants help with OpenCode operation, setup, customization, automation, or troubleshooting.

> Read `references/terminal-reference.md` for exact command tables, config paths, slash commands, and source links.

## Core rule

Prefer the installed binary as the runtime truth:

1. `opencode --version`
2. `opencode --help`
3. `opencode <subcommand> --help`

Use the official docs for workflow guidance and conceptual behavior, but if the local binary disagrees, trust the local help output for commands and flags.

## Terminal operating model

There are four distinct OpenCode modes. Pick the right one.

| Mode | Use when | Command |
| --- | --- | --- |
| TUI | Interactive work in one repo | `opencode` or `opencode /path/to/project` |
| One-shot CLI | Scripting, automation, quick answers | `opencode run ...` |
| Headless backend | Reuse server state or expose web/API | `opencode serve` or `opencode web` |
| Remote attach | Connect a TUI to running backend | `opencode attach http://host:port` |

## Important assistant constraint

If you are operating through a non-interactive shell, do not pretend you can reliably drive the full-screen TUI. In that environment:

- Use `opencode run` for execution.
- Use config file edits for setup/customization.
- Use `opencode debug ...`, `opencode session ...`, `opencode auth ...`, `opencode models`, and `opencode mcp ...` for inspection.
- Explain TUI-only steps with exact slash commands and keybinds instead of faking interaction.

## Recommended setup flow

For a fresh machine or repo, use this order:

1. Install OpenCode.
2. Verify binary/version.
3. Authenticate provider access.
4. Enter the target repo directory.
5. Start OpenCode.
6. Run `/init` to create or update `AGENTS.md`.
7. Run `/models` or `opencode models` and choose the intended model.
8. Add project config only when defaults are not enough.

Minimal bootstrap commands:

```bash
opencode --version
opencode auth login
cd /path/to/project
opencode
```

Inside the TUI:

```text
/connect
/models
/init
```

## Install and upgrade

Common install paths:

- Install script: `curl -fsSL https://opencode.ai/install | bash`
- npm: `npm install -g opencode-ai`
- pnpm: `pnpm install -g opencode-ai`
- bun: `bun install -g opencode-ai`
- Homebrew: `brew install anomalyco/tap/opencode`

Upgrade path:

```bash
opencode upgrade
opencode upgrade v1.2.24
```

If the user asks for package-manager-specific upgrades, match the install method instead of mixing methods.

## Auth and models

Provider auth is managed through either the TUI or CLI.

- TUI: `/connect`
- CLI: `opencode auth login`
- Inspect configured providers: `opencode auth list`
- List models: `opencode models`
- Refresh models cache: `opencode models --refresh`

Credential storage and loading behavior:

- Auth file: `~/.local/share/opencode/auth.json`
- OpenCode also loads provider keys from environment variables.
- Project `.env` files can contribute provider credentials when OpenCode starts.

When a user says "set up OpenCode," verify both auth and model selection, not just installation.

## Project bootstrap and rules

`/init` is the standard project bootstrap step. It scans the repo and creates or updates `AGENTS.md`.

Rules behavior to remember:

- Project rules live in `AGENTS.md`.
- Global rules live in `~/.config/opencode/AGENTS.md`.
- Claude compatibility fallbacks exist via `CLAUDE.md` and `.claude/skills`, unless disabled.
- Additional instruction files can be loaded with `instructions` in `opencode.json`.

Tell users to commit project `AGENTS.md` to Git.

## Config paths and precedence

OpenCode merges config layers. It does not replace the whole config with the last file.

Standard precedence order, lowest to highest:

1. Remote org config from `.well-known/opencode`
2. Global config: `~/.config/opencode/opencode.json`
3. Custom file from `OPENCODE_CONFIG`
4. Project config: `opencode.json`
5. Directory content from `.opencode/`
6. Inline JSON from `OPENCODE_CONFIG_CONTENT`

TUI config is separate:

- Global: `~/.config/opencode/tui.json`
- Project: `tui.json`
- Override path: `OPENCODE_TUI_CONFIG`

Directory conventions use plural names:

- `.opencode/agents/`
- `.opencode/commands/`
- `.opencode/plugins/`
- `.opencode/skills/`
- `.opencode/tools/`
- `.opencode/themes/`

If asked to customize OpenCode, first decide whether the change belongs in:

- `AGENTS.md` for behavioral instructions
- `opencode.json` for runtime, permissions, models, MCP, formatters, instructions
- `tui.json` for theme, keybinds, and view behavior
- `.opencode/*` for local commands, agents, skills, tools, plugins, or themes

## TUI usage

The TUI is the main interactive interface.

High-value interactions:

- `@path` fuzzy-includes a file in the prompt
- `!command` runs a shell command and injects its output
- `/command` runs a slash command
- `Tab` switches primary agents such as Build and Plan

Important slash commands:

- `/connect` - add provider auth
- `/models` - list or select models
- `/init` - create or update `AGENTS.md`
- `/sessions` - switch or resume sessions
- `/compact` - compact long context
- `/details` - toggle tool detail display
- `/editor` - compose prompt in `$EDITOR`
- `/share` and `/unshare` - manage public session sharing
- `/undo` and `/redo` - revert or restore the last message's file changes
- `/new` - start a fresh session
- `/themes` - inspect available themes

Key cautions:

- `/undo` and `/redo` depend on Git-backed restore behavior, so the project must be a Git repo.
- `/share` creates a public link; do not use it casually with sensitive code.

## Agents and modes

Built-in agent model to remember:

- `build` is the normal full-access primary agent.
- `plan` is the restricted primary agent for analysis and planning.
- `general` is a full-access subagent for complex multi-step work.
- `explore` is a fast read-only subagent for repo exploration.

Use `plan` when the user wants design, analysis, or a safe dry run before code changes.

## Non-interactive CLI

For scripts, cron jobs, wrappers, and non-interactive terminal use, prefer `opencode run`.

Examples:

```bash
opencode run "Explain this stack trace"
opencode run --model anthropic/claude-sonnet-4-5 "Review the recent changes"
opencode run --format json "Summarize the repository"
opencode run -f README.md "Explain this project"
opencode run --continue "Continue the previous task"
```

Use these flags deliberately:

- `--model` to pin a model
- `--agent` to force Build, Plan, or a custom agent
- `--file` to attach files
- `--format json` for machine-consumable event output
- `--continue` or `--session` to continue prior work
- `--fork` to branch a session
- `--attach` to reuse a running backend
- `--dir` to set the working directory when supported by the subcommand

If the goal is shell automation and repeatability, `opencode run` is usually better than trying to script the TUI.

## Headless and remote workflows

Use `opencode serve` when you need a persistent backend without a local TUI.

Typical pattern:

```bash
opencode serve
opencode run --attach http://localhost:4096 "Explain this codebase"
opencode attach http://localhost:4096
```

Use `opencode web` when the user wants a browser UI on top of the backend.

If exposing a server beyond localhost, think about:

- `--hostname`
- `--port`
- `--cors`
- `OPENCODE_SERVER_PASSWORD`

## Sessions, export, import, and stats

Common session operations:

- `opencode session list`
- `opencode export [sessionID]`
- `opencode import <file-or-url>`
- `opencode stats`

Use these when the user wants to inspect history, migrate sessions, or measure usage.

## Customizing OpenCode

Know the main customization surfaces:

- `AGENTS.md` - instruction layer
- `opencode.json` - runtime config, permissions, models, MCP, formatters, instructions
- `tui.json` - theme, keybinds, scrolling, diff style
- `.opencode/commands/*.md` - custom slash commands
- `.opencode/agents/*.md` - custom agents
- `.opencode/skills/<name>/SKILL.md` - reusable skills
- `.opencode/tools/*.ts|js` - custom tools

When asked to add one of these, follow native OpenCode conventions instead of inventing a parallel system.

## Permissions and safety

OpenCode is permissive by default.

- Most permissions default to `allow`.
- `external_directory` and `doom_loop` default to `ask`.
- `.env` reads are denied by default except `.env.example`.

Use `permission` in `opencode.json` to tighten behavior. Common safe patterns:

- require approval for `bash`
- require approval for `edit`
- deny dangerous command prefixes like `rm *`
- deny or ask for sensitive skills, MCP tools, or external directories

If the user asks why OpenCode did something without asking, check permissions first.

## Troubleshooting workflow

Use this order when OpenCode is broken or confusing:

1. Check version: `opencode --version`
2. Check command surface: `opencode --help`
3. Show resolved config: `opencode debug config`
4. Show important paths: `opencode debug paths`
5. Check skills: `opencode debug skill`
6. Check models and auth: `opencode auth list` and `opencode models --refresh`
7. Check MCP connectivity: `opencode mcp list`
8. Check sessions: `opencode session list`

Additional useful commands:

- `opencode debug agent <name>`
- `opencode debug lsp`
- `opencode debug rg`
- `opencode db path`
- `opencode db '<sql query>'`

## Version-sensitive notes

OpenCode docs and the installed binary can drift. Treat these as likely drift points:

- command list additions such as `debug`, `db`, or `pr`
- flag changes on `run`, `serve`, `web`, and `attach`
- experimental status of certain features like LSP tooling
- docs that still mention older behavior around `tools` vs `permission`

Always verify locally before giving high-confidence operational guidance.

## Response style for OpenCode terminal help

When answering the user:

1. Name the exact OpenCode mode involved.
2. Give the exact command or slash command.
3. Mention the config file or path if relevant.
4. Call out important constraints like public sharing, Git requirement for undo, or non-interactive shell limits.
5. If the task is version-sensitive, cite the installed version or tell the user what to verify with `--help`.
