# Otto — Global Rules

This is the Otto personal assistant workspace on the Jetson Orin.

## Directory Layout

```
~/.otto/
├── data/           # SQLite databases (reminders, etc.)
├── inbox/          # Syncthing shared folder for ad-hoc files
├── logs/           # Service logs (macOS only, Linux uses journalctl)
└── scripts/        # Cron scripts (check-reminders.sh, etc.)

~/.config/opencode/
├── opencode.jsonc  # This config
├── agents/         # Agent prompt files
│   └── assistant.md
├── memory/         # Memory blocks (managed by opencode-agent-memory)
│   ├── persona.md
│   ├── human.md
│   └── project.md
└── plugins/        # Local plugin overrides (if any)

~/Obsidian/         # Syncthing-synced Obsidian vault (when available)
```

## Important Paths

- Reminders DB: `~/.otto/data/reminders.db`
- Obsidian vault: `~/Obsidian/`
- Otto management script: `/usr/local/bin/otto`

## Conventions

- All times are in Europe/Vienna timezone (CET/CEST)
- Dates use ISO 8601 format (YYYY-MM-DD)
- When creating notes in Obsidian, use the daily note format: `YYYY-MM-DD.md`
- Memory blocks are markdown with YAML frontmatter — the agent-memory plugin manages these
