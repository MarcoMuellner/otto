# Otto — Personal Assistant on OpenCode

A 24/7 AI personal assistant running on a Jetson Orin Nano, accessible from any device on the home network via `otto` in the terminal.

---

## Architecture

```
Your Home Network
─────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────┐
  │  Jetson Orin Nano (always on)                    │
  │                                                  │
  │  systemd user service:                           │
  │  └── opencode serve (:4096, 0.0.0.0)            │
  │      ├── MCP: reminders     (Phase 1)            │
  │      ├── MCP: obsidian      (Phase 2)            │
  │      ├── MCP: gmail         (Phase 3)            │
  │      └── MCP: calendar      (Phase 3)            │
  │                                                  │
  │  syncthing:                                      │
  │  └── Obsidian vault sync    (Phase 2)            │
  │                                                  │
  │  cron jobs:                                      │
  │  ├── */5 * * * *  check-reminders.sh  (Phase 1)  │
  │  ├── 0 */2 * * *  check-mail.sh       (Phase 3)  │
  │  └── 0 7 * * *    morning-briefing.sh  (Phase 3)  │
  │                                                  │
  │  data:                                           │
  │  ├── ~/.otto/ (project dir + config + data)      │
  │  ├── ~/.local/share/opencode/ (sessions)         │
  │  └── ~/Obsidian/ (synced vault)                  │
  └──────────────────────────────────────────────────┘
          ▲
          │ LAN (no auth needed)
          ▼
  ┌──────────────────────┐
  │  Laptop              │
  │                      │
  │  alias otto=         │
  │  "opencode attach    │
  │   http://orin:4096"  │
  │                      │
  │  syncthing (vault)   │
  └──────────────────────┘
          ▲
          │ ntfy.sh push notifications
          ▼
  ┌──────────────────────┐
  │  Phone               │
  │  ntfy app            │
  └──────────────────────┘
```

**Key principles:**

- The Orin is the brain. All state, MCP servers, cron jobs, and sessions live there.
- The laptop is just a thin client via `opencode attach`.
- When the laptop is closed, notifications reach the phone via ntfy.sh.
- No public internet exposure — everything stays on the LAN.
- No auth needed on the local network.


## File Structure

All Otto files live under `~/.otto/` which doubles as the OpenCode project directory. The `opencode serve` service sets `WorkingDirectory=~/.otto/`, so OpenCode discovers the project-level config automatically.

```
~/.otto/                          ← OTTO_HOME = OpenCode project dir
├── opencode.jsonc                ← OpenCode project config
├── AGENTS.md                     ← Global rules + directory layout
├── agents/
│   └── assistant.md              ← Otto system prompt
├── otto.conf                     ← Runtime config (port, agent, platform)
├── .opencode/
│   └── memory/                   ← agent-memory plugin storage
│       ├── persona.md            ← Who Otto is
│       ├── human.md              ← What Otto knows about Marco
│       └── project.md            ← Current context
├── data/                         ← SQLite databases
│   └── reminders.db              ← (Phase 1)
├── mcp/                          ← Custom MCP servers
│   └── reminders/                ← (Phase 1)
│       ├── src/
│       ├── dist/
│       └── package.json
├── scripts/                      ← Cron scripts
│   ├── check-reminders.sh        ← (Phase 1)
│   ├── check-mail.sh             ← (Phase 3)
│   └── morning-briefing.sh       ← (Phase 3)
├── inbox/                        ← Syncthing shared folder for ad-hoc files
└── logs/                         ← Service logs (macOS only; Linux uses journalctl)

~/Obsidian/                       ← Syncthing-synced vault (Phase 2)
```

**Source repo** (what gets checked into git):

```
otto/
├── otto                          ← Management script (install to ~/bin or /usr/local/bin)
├── opencode.jsonc                ← OpenCode config
├── AGENTS.md                     ← Global rules
├── PLAN.md                       ← This file
└── agents/
    └── assistant.md              ← Otto system prompt
```

Running `otto setup` copies the config files from the repo into `~/.otto/`.


## Technology Choices

| Component | Choice | Rationale |
|---|---|---|
| Server hardware | Jetson Orin Nano | Always-on, low power, ARM, local LLM capable |
| AI backend | OpenCode (`opencode serve`) | Open-source, multi-provider, headless mode, MCP support |
| Primary model | `anthropic/claude-sonnet-4-5` | Sweet spot: capable, fast, cheaper than Opus |
| Cheap model | `anthropic/claude-haiku-4-5` | Session titles, routine checks |
| Memory plugin | `opencode-agent-memory` | Letta-style markdown blocks, zero deps, fully local, ARM-compatible |
| Reminder storage | SQLite via `better-sqlite3` | Single file, zero infra, survives reboots |
| MCP servers | TypeScript + Node.js | Matches OpenCode ecosystem |
| Note sync | Syncthing | Bidirectional, real-time, self-hosted, set-and-forget |
| Push notifications | ntfy.sh | Simple HTTP POST, free, phone app, self-hostable |
| Service management | systemd user service (Linux) / launchd (macOS) | Auto-start, auto-restart, lingering support |
| Cron approach | Bash guard + `opencode run --attach` | Near-zero cost: SQLite check is instant, only invokes LLM when needed |


## Decisions Made

1. **Project-level config, not global.** `opencode.jsonc` lives in `~/.otto/` (the working directory), not `~/.config/opencode/`. This isolates Otto from any other OpenCode usage on the same machine.

2. **Cron + bash guard, not a daemon.** Cron runs every 5 minutes. A bash script checks SQLite directly (`sqlite3` query — instant, zero API cost). Only if reminders are due does it call `opencode run --attach`, which reuses the warm `opencode serve` process and its MCP connections.

3. **ntfy.sh for notifications.** Desktop notifications (`notify-send`) don't work when the laptop is closed. ntfy.sh pushes to the phone via a simple `curl` POST. Can be self-hosted later.

4. **`opencode-agent-memory` for memory.** Chosen over `opencode-mem` (requires API keys + sqlite-vec compilation) and `opencode-supermemory` (cloud-based). It stores curated markdown blocks with YAML frontmatter — perfect for a personal assistant's identity and context.

5. **Cross-platform management script.** The `otto` script detects macOS (launchd) vs Linux (systemd) and handles service management accordingly. Tested on both.

6. **Permissions set to `allow`.** Since Otto runs headless via cron and `opencode run`, it can't prompt for confirmation. All tool permissions are pre-approved.


---


## Phase 0: Infrastructure ✅

**Goal:** `otto` typed on the laptop opens an OpenCode TUI connected to the Orin.

**Status:** Complete. All files created and tested.

### Deliverables

- [x] `otto` management script — `setup`, `start`, `stop`, `restart`, `status`, `logs`, `run`, `uninstall`
- [x] `opencode.jsonc` — project-level config with assistant agent, memory plugin, MCP stubs
- [x] `agents/assistant.md` — Otto system prompt with personality, modes, and boundaries
- [x] `AGENTS.md` — global rules, directory layout, conventions

### Deployment Steps (on the Orin)

```bash
# 1. Install OpenCode
curl -fsSL https://opencode.ai/install | bash

# 2. Authenticate with Anthropic
opencode auth login    # select Anthropic, paste API key

# 3. Copy otto script
cp otto ~/bin/otto
chmod +x ~/bin/otto

# 4. Run setup (creates ~/.otto, deploys config, installs systemd service)
otto setup

# 5. Start Otto
otto start

# 6. Verify
otto status
```

### Laptop Setup

```bash
# ~/.zshrc
alias otto="opencode attach http://orin:4096"
```


---


## Phase 1: Reminders (~4 hours)

**Goal:** "Otto, remind me to call the electrician tomorrow at 3pm"

### 1.1 Reminder MCP Server

TypeScript MCP server using `better-sqlite3`. Lives in `~/.otto/mcp/reminders/`.

**SQLite schema:**

```sql
CREATE TABLE reminders (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT,
  due_at      DATETIME NOT NULL,
  recurrence  TEXT,                              -- null | 'daily' | 'weekly' | 'monthly'
  status      TEXT DEFAULT 'pending',            -- pending | delivered | completed | snoozed
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME,
  completed_at DATETIME,
  snoozed_until DATETIME,
  tags        TEXT                               -- JSON array
);

CREATE INDEX idx_reminders_due ON reminders(status, due_at);
```

**MCP tools:**

| Tool | Description |
|---|---|
| `add_reminder` | Create a reminder with title, optional body, due date/time, optional recurrence and tags |
| `list_reminders` | List reminders filtered by status, date range, or tags |
| `complete_reminder` | Mark a reminder as completed |
| `snooze_reminder` | Snooze a reminder by a given duration (e.g. "1h", "tomorrow 9am") |
| `delete_reminder` | Permanently remove a reminder |
| `check_due_reminders` | Return all pending reminders that are currently due or overdue |

**Recurrence:** Start simple — enum values (`daily`, `weekly`, `monthly`). When a recurring reminder is delivered, calculate the next occurrence and create it. Add cron expressions later only if needed (YAGNI).

**Database location:** `~/.otto/data/reminders.db`

### 1.2 Cron + Bash Guard

```bash
# ~/.otto/scripts/check-reminders.sh
#!/bin/bash
DB="$HOME/.otto/data/reminders.db"
PORT="${OTTO_PORT:-4096}"

# Quick SQLite check — instant, zero API cost
DUE_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM reminders WHERE status='pending' AND due_at <= datetime('now')")

if [[ "$DUE_COUNT" -gt 0 ]]; then
  opencode run \
    --attach "http://localhost:${PORT}" \
    --agent assistant \
    "You have ${DUE_COUNT} due reminder(s). Check them with check_due_reminders, notify me via ntfy, and mark them as delivered."
fi
```

Cron entry: `*/5 * * * * ~/.otto/scripts/check-reminders.sh`

### 1.3 ntfy.sh Notifications

Otto uses bash to send notifications:

```bash
curl -d "⏰ Call the electrician" ntfy.sh/otto-marcos
```

This is built into the assistant prompt — Otto knows to use `curl` + ntfy when running headless. No separate MCP server needed initially; it's just a bash command.

**Phone setup:** Install ntfy app → subscribe to `otto-marcos` topic.

**Optional later:** Self-host ntfy on the Orin for full privacy.

### 1.4 Config Update

Uncomment the reminders MCP server in `opencode.jsonc`:

```jsonc
"reminders": {
  "type": "local",
  "command": ["node", "/home/marco/.otto/mcp/reminders/dist/index.js"],
  "enabled": true
}
```

### Phase 1 Verification

- [ ] `otto` → "Remind me to buy milk tomorrow at 10am" → reminder created in SQLite
- [ ] `otto` → "What are my reminders?" → lists pending reminders
- [ ] Wait for cron to fire → ntfy push arrives on phone
- [ ] `otto` → "Complete the milk reminder" → marked as completed
- [ ] Snooze a reminder → verify new due time


---


## Phase 2: Notes / Obsidian (2–3 hours)

**Goal:** "Otto, add a note about the FAIRTIQ onboarding meeting"

### 2.1 Syncthing Setup

Bidirectional sync of the Obsidian vault between laptop and Orin.

```bash
# On both machines:
sudo apt install syncthing   # or brew install syncthing

# Add each machine as a device
# Share the Obsidian vault folder
# Set sync type to "Send & Receive"
```

Vault location on the Orin: `~/Obsidian/`

### 2.2 Obsidian MCP Server

Use an existing community MCP server. Options to evaluate:

- `@smithery/obsidian-mcp` — Smithery-maintained
- `@anthropic/obsidian-mcp` — if available
- Direct file system access via Otto's bash tool (simpler, no MCP needed)

**Minimum viable approach:** Otto already has file system access and bash. It can read/write markdown files in `~/Obsidian/` directly. An MCP server adds search capabilities (full-text, tag-based) but isn't strictly required to start.

Config update:

```jsonc
"obsidian": {
  "type": "local",
  "command": ["npx", "@smithery/cli", "run", "@smithery/obsidian-mcp"],
  "environment": {
    "OBSIDIAN_VAULT_PATH": "/home/marco/Obsidian"
  },
  "enabled": true
}
```

### 2.3 Conventions

- Daily notes: `YYYY-MM-DD.md` in the vault root or `daily/` folder
- Meeting notes: `meetings/YYYY-MM-DD-topic.md`
- Otto-created notes include YAML frontmatter with `created_by: otto` and `created_at` timestamp

### Phase 2 Verification

- [ ] Create a note via Otto → appears in Obsidian on the laptop within seconds
- [ ] Edit a note on the laptop → Otto can read the updated version
- [ ] "Otto, what did I write about FAIRTIQ?" → searches and summarizes


---


## Phase 3: Mail & Calendar (~4 hours)

**Goal:** "Otto, any urgent emails?" / "What's on my calendar today?"

### 3.1 Gmail MCP Server

OAuth2 setup for Gmail API access.

```jsonc
"gmail": {
  "type": "local",
  "command": ["npx", "@anthropic/gmail-mcp"],
  "enabled": true
}
```

**Capabilities:** Read, search, label, archive, draft, send (with confirmation).

**OAuth2 flow:** Run once interactively to authorize. Token stored locally, refreshed automatically.

### 3.2 Google Calendar MCP Server

```jsonc
"gcal": {
  "type": "local",
  "command": ["npx", "@anthropic/google-calendar-mcp"],
  "enabled": true
}
```

**Capabilities:** List today's events, list upcoming events, create events, check for conflicts.

### 3.3 Morning Briefing Cron

Daily at 7:00 AM, Otto summarizes the day ahead:

```bash
# ~/.otto/scripts/morning-briefing.sh
#!/bin/bash
PORT="${OTTO_PORT:-4096}"

opencode run \
  --attach "http://localhost:${PORT}" \
  --agent assistant \
  "Good morning. Prepare my daily briefing:
   1. Today's calendar events
   2. Urgent or unread emails (last 12h)
   3. Any due or overdue reminders
   Send the summary via ntfy."
```

Cron: `0 7 * * * ~/.otto/scripts/morning-briefing.sh`

### 3.4 Periodic Mail Check

```bash
# ~/.otto/scripts/check-mail.sh
#!/bin/bash
PORT="${OTTO_PORT:-4096}"

opencode run \
  --attach "http://localhost:${PORT}" \
  --agent assistant \
  --model anthropic/claude-haiku-4-5 \
  "Check for urgent unread emails in the last 2 hours. Only notify me via ntfy if something genuinely needs my attention. Be selective."
```

Cron: `0 */2 * * * ~/.otto/scripts/check-mail.sh`

Note: Uses Haiku for cost efficiency on routine checks.

### Phase 3 Verification

- [ ] "Otto, what's on my calendar today?" → lists events
- [ ] "Otto, any urgent emails?" → summarizes inbox
- [ ] Morning briefing arrives on phone at 7:00 AM via ntfy
- [ ] "Otto, create a meeting with X on Thursday at 2pm" → event created
- [ ] "Otto, draft a reply to the last email from Y" → draft composed (not sent without confirmation)


---


## Phase 4: Agent Polish (2–3 hours)

**Goal:** Otto feels like *your* assistant, not a generic chatbot.

### 4.1 Memory Seeding

Seed Otto's memory blocks on first run:

**persona.md:**
```yaml
---
type: persona
---
You are Otto, Marco's personal AI assistant. You're concise, proactive, and technical.
You run 24/7 on a Jetson Orin in Stanzach, Austria.
You prefer action over discussion. When you can solve something, just do it.
```

**human.md:**
```yaml
---
type: human
---
Marco is a Tribe Lead Engineer at FAIRTIQ starting April 2026.
Lives in Stanzach, Austria (Europe/Vienna timezone).
Interests: woodworking, 3D printing, skiing, chess.
Communication style: direct, technical, no fluff.
```

Otto updates these blocks as it learns more through conversation.

### 4.2 Session Continuity

Update the laptop alias to auto-continue the last session:

```bash
alias otto="opencode attach --continue http://orin:4096"
```

This way Otto "remembers" the ongoing conversation across terminal opens. Combined with the memory plugin, this gives a strong sense of continuity.

### 4.3 Custom Commands

OpenCode supports custom commands as markdown files in `~/.otto/commands/` (or `~/.config/opencode/commands/`):

**`/briefing`** — `commands/briefing.md`:
```markdown
Prepare my daily briefing:
1. Today's calendar events with times
2. Unread emails that need attention
3. Due or overdue reminders
4. Any notes I created yesterday
Format it concisely. If running headless, send via ntfy.
```

**`/remind`** — `commands/remind.md`:
```markdown
Help me set a reminder. Ask me:
1. What should I be reminded about?
2. When? (date and time)
3. Should it recur?
Then create it using the add_reminder tool.
```

**`/week`** — `commands/week.md`:
```markdown
Give me a weekly review:
1. All completed reminders this week
2. Calendar events from this week
3. Notes created this week
4. Upcoming reminders for next week
Summarize patterns or things I might be forgetting.
```

### Phase 4 Verification

- [ ] Memory blocks populated and persist across sessions
- [ ] Opening `otto` picks up the last conversation
- [ ] `/briefing` command works
- [ ] Otto's tone feels personal and efficient


---


## Phase 5: Backlog (future ideas)

These are stretch goals — each independent, build when the need arises.

### 5.1 Local LLM on the Orin

Run a small model via Ollama for cheap routine tasks (reminder checks, simple queries). Only hit the Anthropic API for complex tasks.

```bash
# Install Ollama on the Orin
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a small model
ollama pull llama3.2:3b
```

OpenCode config addition:
```jsonc
"model": "ollama/llama3.2:3b"  // for the cheap agent
```

**Use case:** Cron jobs that check reminders or triage mail could use the local model, making them completely free. Reserve Sonnet for interactive sessions.

### 5.2 Webhook Receiver

A lightweight HTTP endpoint on the Orin that triggers Otto from external events:

- GitHub webhooks → "PR #123 was merged"
- Home sensor alerts → "Garage door left open"
- Custom integrations → anything that can POST JSON

### 5.3 Home Automation MCP

If/when smart home devices enter the picture, an MCP server wrapping Home Assistant or similar.

### 5.4 Voice Input

MacWhisper on the laptop → transcribed text → piped to `opencode run --attach`:

```bash
# Hypothetical workflow
macwhisper --output-text | opencode run --attach http://orin:4096 --agent assistant
```

### 5.5 Weekly Review Cron

```bash
# Monday 9:00 AM
0 9 * * 1 ~/.otto/scripts/weekly-review.sh
```

Otto summarizes the past week: completed tasks, notable emails, notes created, upcoming deadlines.

### 5.6 Inbox File Processing

Syncthing's `~/.otto/inbox/` as a drop folder. Otto periodically checks for new files and processes them (summarize a PDF, extract action items from meeting notes, etc.).


---


## Summary

| Phase | What | Time | Value | Status |
|---|---|---|---|---|
| 0 | Infrastructure + `otto` script | 1–2h | Can talk to Otto | ✅ Done |
| 1 | Reminders + ntfy notifications | ~4h | First real capability | 🔜 Next |
| 2 | Obsidian notes via Syncthing | 2–3h | Knowledge management | Planned |
| 3 | Gmail + Calendar + morning briefing | ~4h | Daily awareness | Planned |
| 4 | Memory seeding + session continuity + commands | 2–3h | Feels personal | Planned |
| 5 | Local LLM, webhooks, voice, home automation | Backlog | Nice-to-haves | Ideas |

Each phase is independently useful. You can stop after any phase and have a working assistant.


## Cost Estimate

| Activity | Model | Frequency | Est. tokens/call | Monthly cost |
|---|---|---|---|---|
| Interactive chat | Sonnet 4.5 | ~20/day | ~2K in + 1K out | ~$15–25 |
| Reminder check | Haiku 4.5 (or none) | 288/day (every 5 min) | ~500 (only when due) | ~$1–3 |
| Mail check | Haiku 4.5 | 12/day | ~1K | ~$1 |
| Morning briefing | Sonnet 4.5 | 1/day | ~3K | ~$2 |
| **Total estimate** | | | | **~$20–30/month** |

Bash guard on the reminder cron means most invocations cost zero (SQLite check only). Local LLM (Phase 5) would reduce costs further.
