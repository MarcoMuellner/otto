# Otto - Requirements Document

> Your personal assistant that actually does things. Secure by default.

**Version:** 0.1.0  
**Last Updated:** 2026-01-29  
**Status:** Draft

---

## 1. Vision

Otto is a self-hosted personal assistant designed to be a true life admin - not just a chatbot that answers questions, but an agent that takes action on your behalf. It runs on a server-client architecture, allowing the server to operate 24/7 on dedicated hardware (Raspberry Pi, home server, VPS) while the user interacts through familiar messaging channels.

### Core Principles

1. **Secure by Default** - No implicit access. File access is explicit. Execution is sandboxed. Authentication is mandatory.
2. **Proactive, Not Passive** - Otto reaches out when relevant. Morning briefings, reminders, alerts on events.
3. **Self-Aware** - Otto knows exactly what it can and cannot do. It explains limitations clearly.
4. **User in Control** - Configuration changes require confirmation. Autonomy levels are explicit. Full audit trail.
5. **Channel Agnostic** - WhatsApp first, but architected for easy addition of Telegram, Signal, Discord, etc.

### Inspiration

Inspired by Clawd/Moltbot's viral success, but with a cleaner, more secure approach. Otto takes the best ideas - persistent memory, proactive features, messaging integration - while avoiding the security pitfalls and chaotic personality.

---

## 2. Core Identity

### Name
**Otto** - Reliable butler energy. Warm, competent, trustworthy.

### Personality
- **Warm but professional** - Friendly without being chaotic
- **Direct** - Gets to the point, doesn't over-explain
- **Opinionated** - Has preferences, makes recommendations
- **Honest** - Admits limitations, explains why things can't be done
- **Proactive** - Suggests actions, anticipates needs
- **Respectful** - Never condescending, respects user's time

### Voice Examples

**Good:**
> "Morning, Marco. You've got 3 meetings today, starting at 10am. Two emails need attention - one from your bank looks time-sensitive. Want me to summarize them?"

**Good (limitation):**
> "I can't access your Dropbox - I only have Google Drive connected. Want me to set up Dropbox integration?"

**Bad (too formal):**
> "Good morning. I have analyzed your schedule and determined you have three appointments scheduled for today."

**Bad (too chaotic):**
> "GOOD MORNING SUNSHINE! 🌟 Let's CRUSH today! You've got meetings meetings meetings!"

---

## 3. Architecture

### Pattern
Server-client architecture with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│                         OTTO SERVER                             │
│                   (Raspberry Pi / Home Server / VPS)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Gateway   │  │    Agent    │  │        Storage          │ │
│  │             │  │             │  │                         │ │
│  │ - Channels  │  │ - LLM calls │  │ - RAG / Vector DB       │ │
│  │ - Routing   │  │ - Tools     │  │ - Conversation history  │ │
│  │ - Auth      │  │ - MCP       │  │ - User preferences      │ │
│  │ - Sessions  │  │ - Autonomy  │  │ - Audit log             │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Scheduler  │  │   Sandbox   │  │      Integrations       │ │
│  │             │  │             │  │                         │ │
│  │ - Cron jobs │  │ - Isolated  │  │ - Gmail                 │ │
│  │ - Heartbeat │  │   execution │  │ - Google Calendar       │ │
│  │ - Triggers  │  │ - No local  │  │ - Google Tasks          │ │
│  │             │  │   access    │  │ - (Future: more)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / HTTPS
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ WhatsApp │   │ Telegram │   │  WebChat │
        │          │   │ (future) │   │ (future) │
        └──────────┘   └──────────┘   └──────────┘
```

### Stack
- **Runtime:** Node.js (v22+)
- **Language:** TypeScript
- **LLM (V1):** OpenAI Codex
- **LLM (Future):** Local models (Ollama, llama.cpp)
- **Database:** SQLite + vector extensions for RAG
- **Message Queue:** TBD (for async job processing)

### Hardware Target
- Primary: Raspberry Pi 4/5 (ARM64)
- Also supports: x86_64 Linux, macOS, Windows (WSL2)
- Resource budget: Should run comfortably on 2GB RAM

---

## 4. Channels

### Design Principle
Channels are adapters. The core agent logic knows nothing about WhatsApp vs Telegram - it receives normalized messages and sends normalized responses.

### Channel Interface

```typescript
interface Channel {
  name: string;
  
  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Messaging
  onMessage(handler: (msg: IncomingMessage) => void): void;
  sendMessage(to: string, msg: OutgoingMessage): Promise<void>;
  
  // Capabilities
  capabilities: {
    voiceNotes: boolean;
    fileUpload: boolean;
    fileDownload: boolean;
    reactions: boolean;
    typing: boolean;
  };
}

interface IncomingMessage {
  id: string;
  channel: string;
  sender: string;
  timestamp: Date;
  type: 'text' | 'voice' | 'file' | 'image';
  content: string | Buffer;
  metadata?: Record<string, unknown>;
}

interface OutgoingMessage {
  type: 'text' | 'file' | 'image';
  content: string | Buffer;
  replyTo?: string;
}
```

### V1: WhatsApp
- **Protocol:** Baileys (WhatsApp Web protocol)
- **Features:** Text, voice notes, files, images
- **Auth:** QR code linking (like WhatsApp Web)
- **Limitations:** Unofficial API, may break, Meta may block

### Future Channels
- Telegram (Bot API - official, stable)
- Signal (signal-cli)
- Discord (Bot API)
- WebChat (built-in web UI)
- SMS (Twilio)

### Voice Note Handling
1. Receive voice note as audio file
2. Transcribe using Whisper (OpenAI API or local)
3. Process transcription as text message
4. Store original audio + transcription

---

## 5. Memory & RAG

### Purpose
Otto remembers everything relevant about the user - preferences, past conversations, context, projects, people mentioned. This enables true continuity across sessions.

### Storage Layers

#### 5.1 Conversation History
- Full message history (both directions)
- Indexed by timestamp, channel, sender
- Searchable
- Retention policy configurable

#### 5.2 User Profile
- Explicit preferences ("don't message before 9am")
- Learned facts ("Marco works at FAIRTIQ")
- Relationships ("Hans is Marco's brother")
- Updated continuously from conversations

#### 5.3 Semantic Memory (RAG)
- Vector embeddings of conversations and facts
- Similarity search for relevant context
- Injected into LLM prompts as needed

### Implementation

```
┌─────────────────────────────────────────┐
│              SQLite Database            │
├─────────────────────────────────────────┤
│ conversations    │ Full message log     │
│ user_profile     │ Key-value facts      │
│ embeddings       │ Vector store (sqlite-vss or similar) │
│ audit_log        │ All actions taken    │
│ config           │ Otto's configuration │
└─────────────────────────────────────────┘
```

### Context Assembly
When processing a message:
1. Retrieve recent conversation history (last N messages)
2. Query RAG for semantically relevant memories
3. Include user profile facts
4. Include current context (time, day, recent events)
5. Assemble into prompt

---

## 6. Integrations

### Design Principle
All integrations are implemented as MCP (Model Context Protocol) servers. This provides:
- Standardized tool interface
- Clear capability boundaries
- Sandboxed execution
- Easy addition of new integrations

### V1 Integrations

#### 6.1 Gmail
**Capabilities:**
- Read inbox (list, search, get message)
- Send email
- Archive/label messages
- Mark read/unread

**Autonomy:**
- Read: Autonomous
- Send: Requires confirmation
- Archive: Autonomous
- Delete: Always ask

#### 6.2 Google Calendar
**Capabilities:**
- List events (today, week, range)
- Get event details
- Create events
- Update events
- Delete events

**Autonomy:**
- Read: Autonomous
- Create: Requires confirmation
- Update: Requires confirmation
- Delete: Always ask

#### 6.3 Google Tasks
**Capabilities:**
- List tasks
- Create task
- Complete task
- Delete task

**Autonomy:**
- Read: Autonomous
- Create: Autonomous (it's low risk)
- Complete: Autonomous
- Delete: Requires confirmation

### Future Integrations
- Google Drive
- Notion
- Home Assistant
- GitHub
- Todoist
- Spotify
- Weather services

### MCP Server Structure

```
/integrations
  /gmail
    - mcp-server.ts      # MCP server implementation
    - tools.ts           # Tool definitions
    - auth.ts            # OAuth handling
    - MANIFEST.md        # Human-readable capabilities
  /google-calendar
    - ...
  /google-tasks
    - ...
```

---

## 7. Proactive Features

### Design Principle
Otto doesn't just respond - it initiates. But proactively reaching out must be valuable, not annoying.

### 7.1 Scheduled Jobs (Cron)

**Morning Briefing** (configurable time, e.g., 7:30am)
- Weather for today
- Calendar overview
- Important unread emails
- Tasks due today
- Any overnight alerts

**Evening Summary** (optional)
- What was accomplished
- Upcoming tomorrow
- Reminders for morning

### 7.2 Event Triggers

**Email Triggers:**
- New email from VIP contacts → immediate notification
- Email matching rules (keywords, senders) → alert
- No response to important thread after N days → reminder

**Calendar Triggers:**
- Event in 15 minutes → reminder
- Event tomorrow requires preparation → evening reminder

**Custom Triggers:**
- Webhooks from external services
- File appearance in watched locations (via integration)
- API polling (e.g., package tracking)

### 7.3 Heartbeat
- Regular self-check (every 5 minutes)
- Verifies all services running
- Alerts user if something breaks

### Configuration

```typescript
interface ProactiveConfig {
  morningBriefing: {
    enabled: boolean;
    time: string;          // "07:30"
    timezone: string;      // "Europe/Vienna"
    includeWeather: boolean;
    includeCalendar: boolean;
    includeEmail: boolean;
    includeTasks: boolean;
  };
  
  quietHours: {
    enabled: boolean;
    start: string;         // "22:00"
    end: string;           // "08:00"
    exceptUrgent: boolean;
  };
  
  emailAlerts: {
    vipContacts: string[];
    keywords: string[];
    alwaysNotify: boolean;
  };
}
```

---

## 8. Autonomy Levels

### Principle
Different actions have different risk levels. Otto's freedom to act should match the consequences of acting wrong.

### Level Definitions

#### Tier 1: Autonomous
Otto can do these without asking.

- Read any connected data (email, calendar, tasks)
- Summarize information
- Send notifications to user
- Create low-risk items (tasks, notes)
- Query external APIs (weather, etc.)
- Complete tasks

#### Tier 2: Confirm First
Otto must ask before doing these.

- Send emails
- Create calendar events
- Modify calendar events
- Update user profile/preferences
- Change Otto's own configuration
- Execute approved commands

#### Tier 3: Always Ask
Otto must always get explicit approval, even if pre-approved.

- Delete anything (emails, events, tasks)
- Financial actions (when integrated)
- Actions affecting others (inviting people to events)
- Sensitive data operations
- Anything with external consequences that can't be undone

### Confirmation Flow

```
User: "Send an email to Hans saying I'll be late"

Otto: "I'll send this email to Hans (hans@example.com):

  Subject: Running late
  
  Hi Hans,
  
  I'll be running about 15 minutes late today.
  
  Best,
  Marco

Send it? (yes/no)"

User: "yes"

Otto: "Sent ✓"
```

### Override Mechanism
User can pre-approve certain actions:

```
User: "From now on, send emails to Hans without asking"

Otto: "Got it. I'll send emails to Hans (hans@example.com) without 
confirmation. I'll still show you what I'm sending. You can 
change this anytime by saying 'require confirmation for emails 
to Hans'. Confirm this change?"

User: "yes"

Otto: "Done. Emails to Hans are now auto-approved."
```

---

## 9. Security

### 9.1 Authentication & Authorization

**Gateway Authentication:**
- All API endpoints require authentication
- Token-based auth for programmatic access
- Session management for web UI

**Channel Authorization (Allowlist):**
- Only approved phone numbers/accounts can interact
- Pairing system for new contacts:
  1. Unknown sender messages Otto
  2. Otto generates 6-digit pairing code
  3. Code sent to user via approved channel
  4. User approves: `otto pairing approve <code>`
  5. Sender added to allowlist

**Integration Authorization:**
- OAuth2 for Google services
- Tokens stored encrypted
- Scopes limited to required permissions

### 9.2 File Access

**Principle:** Otto has zero implicit file access. All file access is explicit.

**Allowed:**
- Files sent directly via messaging channels
- Files explicitly shared via integration (Google Drive link)
- Files in explicitly configured directories

**Not Allowed:**
- Arbitrary filesystem access
- Reading files not explicitly provided
- Writing files outside designated output directory

### 9.3 Command Execution

**Principle:** All command execution happens in a sandbox. Never on the host system.

**Sandbox Options:**
- Docker container (preferred)
- Firecracker microVM
- gVisor

**Sandbox Properties:**
- No network access (unless explicitly granted)
- No filesystem access (except designated volumes)
- Resource limits (CPU, memory, time)
- No persistence between executions

**Execution Flow:**
1. User requests command execution
2. Otto explains what will run and shows command
3. User confirms
4. Command runs in sandbox
5. Output captured and returned
6. Sandbox destroyed

### 9.4 Data Security

**At Rest:**
- Database encrypted (SQLite encryption extension)
- API tokens encrypted
- Sensitive config values encrypted

**In Transit:**
- TLS required for all connections
- No plaintext API calls

**Secrets Management:**
- Environment variables for sensitive config
- No secrets in config files
- Secrets never logged

### 9.5 Audit Trail

Every action Otto takes is logged:

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;           // "email.send", "calendar.create", etc.
  autonomyLevel: 1 | 2 | 3;
  userConfirmed: boolean;
  input: Record<string, unknown>;   // What triggered the action
  output: Record<string, unknown>;  // What happened
  success: boolean;
  error?: string;
}
```

**User Commands:**
- `otto audit today` - Show all actions today
- `otto audit search <query>` - Search audit log
- `otto audit export` - Export full audit log

---

## 10. Self-Awareness & Configuration

### 10.1 Capabilities Manifest

Otto maintains a complete, accurate manifest of its capabilities:

```typescript
interface CapabilitiesManifest {
  channels: {
    name: string;
    connected: boolean;
    features: string[];
  }[];
  
  integrations: {
    name: string;
    connected: boolean;
    tools: {
      name: string;
      description: string;
      autonomyLevel: 1 | 2 | 3;
    }[];
  }[];
  
  proactive: {
    feature: string;
    enabled: boolean;
    config: Record<string, unknown>;
  }[];
}
```

**User Commands:**
- "What can you do?" → Summarized capabilities
- "Can you access my email?" → Specific capability check
- "Why can't you do X?" → Explains limitation and how to enable

### 10.2 Configuration via Chat

Otto's configuration is fully manageable through conversation:

**Examples:**

```
User: "Don't message me before 9am"

Otto: "I'll hold non-urgent messages until 9am on all days. 
Urgent alerts will still come through. Confirm?"

User: "yes"

Otto: "Done. Quiet hours set: 00:00-09:00 daily."
```

```
User: "Show me your current config"

Otto: "Here's my current configuration:

**Quiet Hours:** 00:00-09:00 daily (urgent bypasses)
**Morning Briefing:** 07:30, includes calendar, email, weather
**Email Alerts:** VIP list has 3 contacts, keywords: [invoice, urgent]
**Auto-approved:** Emails to Hans, task creation
**Integrations:** Gmail ✓, Calendar ✓, Tasks ✓

Want to change anything?"
```

### 10.3 Self-Modification via MCP

Otto exposes its own configuration as an MCP server:

**Tools:**
- `config.get(key)` - Read config value
- `config.set(key, value)` - Set config value (requires confirmation)
- `config.list()` - List all config keys
- `capabilities.list()` - Get capabilities manifest
- `capabilities.check(action)` - Check if action is possible

**Flow:**
1. User requests config change via natural language
2. Otto interprets request
3. Otto calls `config.set()` tool
4. Tool returns "confirmation required"
5. Otto asks user to confirm
6. User confirms
7. Otto calls `config.confirm(changeId)`
8. Config updated

---

## 11. Observability

### 11.1 Logging

**Log Levels:**
- `error` - Something broke
- `warn` - Something unexpected but handled
- `info` - Normal operations (default)
- `debug` - Detailed debugging info
- `trace` - Everything

**Log Destinations:**
- File (rotated daily)
- Stdout (for container deployments)
- Optional: remote logging service

### 11.2 Metrics

**Tracked Metrics:**
- Messages processed (by channel)
- LLM calls (count, tokens, latency, cost)
- Tool invocations (by integration)
- Errors (by type)
- Uptime

**Cost Tracking:**

```typescript
interface CostTracker {
  daily: {
    date: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }[];
  
  budget: {
    daily: number | null;    // Max daily spend
    monthly: number | null;  // Max monthly spend
    warnAt: number;          // Percentage to warn at (e.g., 80)
  };
}
```

**User Commands:**
- "How much have you cost me today?" → Cost summary
- "Set a daily budget of $5" → Budget configuration
- Otto proactively warns when approaching budget

### 11.3 Health Checks

**Endpoint:** `GET /health`

```json
{
  "status": "healthy",
  "uptime": "3d 4h 12m",
  "components": {
    "gateway": "healthy",
    "agent": "healthy",
    "database": "healthy",
    "whatsapp": "connected",
    "gmail": "connected",
    "calendar": "connected"
  },
  "lastActivity": "2026-01-29T10:15:00Z"
}
```

### 11.4 User-Facing Observability

```
User: "What did you do today?"

Otto: "Today I:
- Sent your morning briefing at 7:30am
- Processed 12 messages from you
- Read 34 emails, flagged 3 as important
- Created 2 calendar events (both confirmed by you)
- Completed 1 task
- Made 23 LLM calls (~$0.42)

Want details on anything specific?"
```

---

## 12. CLI Interface

### Commands

```bash
# Lifecycle
otto start                  # Start the server
otto stop                   # Stop the server
otto restart                # Restart the server
otto status                 # Show status

# Gateway
otto gateway start          # Start gateway daemon
otto gateway stop           # Stop gateway daemon
otto gateway status         # Gateway status

# Channels
otto channels list          # List configured channels
otto channels login         # Login to WhatsApp (QR code)
otto channels logout        # Logout from channel

# Configuration
otto config show            # Show current config
otto config set <key> <val> # Set config value
otto config edit            # Open config in editor

# Pairing
otto pairing list           # Show pending pairing requests
otto pairing approve <code> # Approve a pairing request
otto pairing revoke <id>    # Revoke access

# Audit
otto audit today            # Show today's actions
otto audit search <query>   # Search audit log
otto audit export           # Export audit log

# Agent
otto agent chat             # Interactive chat mode
otto agent message "..."    # Send one-off message

# Diagnostics
otto doctor                 # Run health checks
otto logs                   # View logs
otto logs --follow          # Tail logs
```

---

## 13. Future Considerations (Not V1)

### Multi-User Support
- Multiple users, each with own profile/context
- Shared household assistant mode
- Per-user autonomy settings
- Access delegation

### Local LLM
- Ollama integration
- llama.cpp for Raspberry Pi
- Model selection per task (local for simple, cloud for complex)
- Fully offline operation mode

### Additional Channels
- Telegram (high priority - stable API)
- Signal
- Discord
- Matrix
- SMS via Twilio

### Additional Integrations
- Notion
- Todoist
- Home Assistant
- GitHub
- Slack (personal workspace)
- Banking (read-only)
- Package tracking
- Travel (flights, hotels)

### Voice Interface
- Two-way voice calls
- Wake word detection
- Local speech-to-text
- Local text-to-speech

### Mobile App
- Native companion app
- Push notifications
- Quick actions

---

## 14. Success Criteria

### V1 is successful when:

1. **Reliable** - Runs for days without intervention on Raspberry Pi
2. **Responsive** - Responds to WhatsApp messages within 10 seconds
3. **Useful** - Successfully handles daily email/calendar triage
4. **Secure** - No data leaks, no unauthorized access
5. **Observable** - User can always see what Otto did and why
6. **Configurable** - User can adjust behavior without touching code
7. **Trustworthy** - User feels confident Otto won't do something unexpected

### Metrics

| Metric | Target |
|--------|--------|
| Uptime | >99% (excluding planned maintenance) |
| Message latency | <10s p95 |
| Cost per day | <$2 for typical usage |
| Memory usage | <500MB |
| Startup time | <30s |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Channel** | A messaging platform adapter (WhatsApp, Telegram, etc.) |
| **Integration** | An external service connection (Gmail, Calendar, etc.) |
| **MCP** | Model Context Protocol - standard for LLM tool interfaces |
| **Gateway** | The server component handling connections and routing |
| **Agent** | The LLM-powered decision-making component |
| **RAG** | Retrieval Augmented Generation - injecting relevant context into prompts |
| **Autonomy Level** | Classification of how much confirmation an action requires |
| **Pairing** | Process of approving a new contact to interact with Otto |

---

## Appendix B: Related Documents

- `ARCHITECTURE.md` - Technical architecture details (to be created)
- `SECURITY.md` - Security model deep-dive (to be created)
- `PERSONALITY.md` - Otto's personality guide (to be created)
- `INTEGRATIONS.md` - Integration development guide (to be created)

---

*This is a living document. Update as requirements evolve.*
