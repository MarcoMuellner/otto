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
  │      ├── MCP: reminders adapter (Phase 1)        │
  │      ├── MCP: obsidian      (Phase 2)            │
  │      ├── MCP: gmail         (Phase 3)            │
  │      └── MCP: calendar      (Phase 3)            │
  │                                                  │
  │  syncthing:                                      │
  │  └── Obsidian vault sync    (Phase 2)            │
  │                                                  │
  │  cron jobs:                                      │
  │  ├── */15 * * * * check-reminders.sh  (Phase 1, optional escalation) │
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
          │ Telegram bot + ntfy escalations
          ▼
  ┌──────────────────────┐
  │  Phone               │
  │  Telegram + ntfy app │
  └──────────────────────┘
```

**Key principles:**

- The Orin is the brain. All state, MCP servers, cron jobs, and sessions live there.
- The laptop is just a thin client via `opencode attach`.
- When the laptop is closed, reminders arrive via provider-native mobile notifications; Telegram is the primary direct chat channel; ntfy.sh is used for escalations/briefings.
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
│       ├── human.md              ← What Otto knows about the user
│       └── project.md            ← Current context
├── data/                         ← Local data/cache (optional)
│   └── reminders-cache.db        ← (optional Phase 1 cache/archive)
├── mcp/                          ← Custom MCP servers
│   └── reminders/                ← (Phase 1 adapter)
│       ├── src/
│       ├── dist/
│       └── package.json
├── scripts/                      ← Cron scripts
│   ├── check-reminders.sh        ← (Phase 1 escalation, optional)
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
| Reminder backend | Google Tasks (primary) / Todoist (optional) | Better native reminder UX, reliable mobile delivery, completion tracking |
| Direct messaging | Telegram via `opencode-telegram-bridge` | Two-way assistant chat, proactive push, allowlist controls |
| MCP servers | TypeScript + Node.js | Matches OpenCode ecosystem |
| Note sync | Syncthing | Bidirectional, real-time, self-hosted, set-and-forget |
| Push notifications | ntfy.sh | Simple HTTP POST, free, phone app, self-hostable |
| Service management | systemd user service (Linux) / launchd (macOS) | Auto-start, auto-restart, lingering support |
| Reminder polling | Optional cron escalation + `opencode run --attach` | Escalate only overdue/high-priority reminders without replacing native notifications |


## Decisions Made

1. **Project-level config, not global.** `opencode.jsonc` lives in `~/.otto/` (the working directory), not `~/.config/opencode/`. This isolates Otto from any other OpenCode usage on the same machine.

2. **Managed reminder backend, not local-first reminder state.** Use Google Tasks (or Todoist) as source of truth for reminders so delivery, snooze, and completion work natively on mobile.

3. **Native reminders first, ntfy.sh for escalation.** Provider notifications handle routine reminder delivery. ntfy is reserved for selective escalations and briefings.

4. **Telegram bridge for direct communication.** `opencode-telegram-bridge` provides two-way messaging, proactive push, allowlist enforcement, and persistent sessions without exposing a public webhook endpoint.

5. **`opencode-agent-memory` for memory.** Chosen over `opencode-mem` (requires API keys + sqlite-vec compilation) and `opencode-supermemory` (cloud-based). It stores curated markdown blocks with YAML frontmatter — perfect for a personal assistant's identity and context.

6. **Cross-platform management script.** The `otto` script detects macOS (launchd) vs Linux (systemd) and handles service management accordingly. Tested on both.

7. **Permissions set to `allow`.** Since Otto runs headless via cron and `opencode run`, it can't prompt for confirmation. All tool permissions are pre-approved.


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


## Phase 1: Reminders (managed backend) (~3-4 hours)

**Goal:** "Otto, remind me to call the electrician tomorrow at 3pm" with reliable native phone notifications and completion tracking.

### 1.1 Reminder backend choice

Use a managed reminders system as the source of truth.

**Primary:** Google Tasks (integrates naturally with Google account and mobile ecosystem)

**Alternative:** Todoist (excellent UX and natural-language recurrence)

Otto remains the orchestration layer and natural-language interface; reminder state lives in the provider.

### 1.2 Reminder MCP adapter

Implement or configure a reminder MCP adapter that maps Otto tools to the provider API.

**MCP tools (stable interface):**

| Tool | Description |
|---|---|
| `add_reminder` | Create reminder/task with title, optional notes, due date/time, recurrence |
| `list_reminders` | List reminders by status/date range/list |
| `complete_reminder` | Mark reminder/task done in provider |
| `snooze_reminder` | Shift due time by duration or target datetime |
| `delete_reminder` | Remove reminder/task |
| `check_due_reminders` | Return reminders currently due/overdue |

Keep this interface provider-agnostic so backend can switch later without changing prompt behavior.

### 1.3 Delivery model

- **Primary delivery:** provider-native notifications (Google/Todoist mobile notifications)
- **Secondary delivery:** `ntfy` for escalations, summaries, and headless briefings

This avoids duplicating reminder delivery logic in cron while keeping Otto proactive.

### 1.4 Polling and escalation (optional but useful)

Use a lightweight cron check for overdue follow-up/escalation only (not primary delivery):

- If an important reminder is overdue and still not completed, Otto sends a selective `ntfy` nudge.
- Avoid noisy repeat notifications.

### 1.5 Config updates

- Enable provider MCP(s) in `opencode.jsonc` (Google Tasks and/or Todoist integration path).
- Keep reminders adapter tool names (`add_reminder`, `list_reminders`, etc.) stable.

### 1.6 Telegram bridge (direct assistant communication)

Use `opencode-telegram-bridge` as the direct user communication channel:

```bash
npm install -g opencode-telegram-bridge
opencode-telegram-bridge setup
```

Required env vars:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`
- `OPENCODE_SERVER_URL` (usually `http://127.0.0.1:4096`)

Operational notes:

- Run as a user service (`systemd` on Linux / `launchd` on macOS).
- Keep strict allowlist to block unknown Telegram users.
- Keep token out of git (`.env`/service env only).
- Prefer polling mode via the bridge defaults (no public webhook needed).

### 1.7 Hardening checklist

- [ ] Bot token stored only in service env file with strict file permissions
- [ ] `TELEGRAM_ALLOWED_USER_ID` set and verified
- [ ] OpenCode server bound to local network policy (localhost where possible)
- [ ] Quiet hours + anti-spam escalation policy defined in assistant behavior
- [ ] Service health checks/logs verified (`journalctl`/`launchctl`)

### Phase 1 Verification

- [ ] `otto` → "Remind me to buy milk tomorrow at 10am" → reminder appears in provider app
- [ ] Native phone notification fires at due time
- [ ] `otto` → "What are my reminders?" → Otto lists provider reminders accurately
- [ ] `otto` → "Complete the milk reminder" → completion state updates in provider
- [ ] Snooze/reschedule via Otto → updated due time visible in provider
- [ ] Telegram bot receives `"what's next today?"` and replies via OpenCode bridge
- [ ] Otto can proactively push a Telegram alert for overdue/high-priority item
- [ ] (Optional) Overdue escalation via `ntfy` works without spam


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


## Phase 3: Mail, Calendar, and Communications (~4-5 hours)

**Goal:** "Otto, any urgent emails?" / "What's on my calendar today?" / "Text me when something needs attention."

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
    Send the summary via Telegram (fallback to ntfy if unavailable)."
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
  "Check for urgent unread emails in the last 2 hours. Notify via Telegram first (fallback ntfy) only if something genuinely needs my attention. Be selective."
```

Cron: `0 */2 * * * ~/.otto/scripts/check-mail.sh`

Note: Uses Haiku for cost efficiency on routine checks.

### Phase 3 Verification

- [ ] "Otto, what's on my calendar today?" → lists events
- [ ] "Otto, any urgent emails?" → summarizes inbox
- [ ] Morning briefing arrives on phone at 7:00 AM via Telegram (fallback ntfy)
- [ ] "Otto, create a meeting with X on Thursday at 2pm" → event created
- [ ] "Otto, draft a reply to the last email from Y" → draft composed (not sent without confirmation)


---


## Phase 4: Agent Polish (2–3 hours)

**Goal:** Otto feels like *your* assistant, not a generic chatbot.

### 4.1 Memory Seeding

Seed memory with adaptive defaults (no hardcoded user identity):

**persona.md:**
```yaml
---
type: persona
---
You are Otto, a world-class personal assistant.
Be concise, proactive, and high-judgment.
Protect the user's time and convert intent into execution.
```

**human.md:**
```yaml
---
type: human
---
preferred_assistant_persona:
  role: unknown
  tone: unknown
  directness: unknown
  verbosity: unknown
  challenge_level: unknown
  proactivity: unknown
user_profile:
  identity: unknown
  role_profession: unknown
  current_focus: unknown
  top_priorities: []
  constraints: []
```

On first interactive run, Otto asks for missing persona/profile data, stores it, and updates over time.

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
Format it concisely. If running headless, send via Telegram (fallback ntfy).
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
| 1 | Managed reminders (Google Tasks/Todoist) + escalation | ~3-4h | First real capability with strong mobile UX | 🔜 Next |
| 2 | Obsidian notes via Syncthing | 2–3h | Knowledge management | Planned |
| 3 | Gmail + Calendar + Telegram communications + morning briefing | ~4-5h | Daily awareness + direct assistant channel | Planned |
| 4 | Memory seeding + session continuity + commands | 2–3h | Feels personal | Planned |
| 5 | Local LLM, webhooks, voice, home automation | Backlog | Nice-to-haves | Ideas |

Each phase is independently useful. You can stop after any phase and have a working assistant.


## Cost Estimate

| Activity | Model | Frequency | Est. tokens/call | Monthly cost |
|---|---|---|---|---|
| Interactive chat | Sonnet 4.5 | ~20/day | ~2K in + 1K out | ~$15–25 |
| Telegram bridge runtime | Bot API (no LLM by itself) | Continuous | N/A | ~$0 |
| Reminder escalation check (optional) | Haiku 4.5 (or none) | 96/day (every 15 min) | ~500 (only when overdue/high-priority) | ~$0–2 |
| Mail check | Haiku 4.5 | 12/day | ~1K | ~$1 |
| Morning briefing | Sonnet 4.5 | 1/day | ~3K | ~$2 |
| **Total estimate** | | | | **~$20–30/month** |

With managed reminders, most routine delivery happens outside LLM calls; Otto is mainly used for orchestration and selective escalation. Local LLM (Phase 5) can reduce cron/triage costs further.
