# Otto Architecture

> Your reliable butler in the cloud (or on a Pi). A self-hosted personal assistant that connects via WhatsApp, handles your email and calendar, and remembers what matters. Secure by default, actually useful.

## Overview

Otto is a self-hosted personal assistant designed to run 24/7 on a Raspberry Pi or similar device. It connects through multiple channels (WhatsApp, TUI, web dashboard), orchestrates tasks via an LLM-powered agent, and integrates with external services like Gmail and Google Calendar.

**Core principles:**

- **Secure by default** — Explicit permissions, sandboxed execution, full audit trail
- **Actually useful** — Does things, not just answers questions
- **Self-hosted** — Your data stays yours
- **Pi-capable** — Runs on modest hardware

---

## System Diagram

```
                                         ┌────────────────────────────────────────────────────────────────────────────┐
                                         │                                  otto                                      │
                                         │                                                                            │
                                         │  ┌────────────────────┐          ┌─────────────┐                           │
                                         │  │   Memory Manager   │          │   Channels  │                           │
                                         │  └─────────┬──────────┘          │ ┄┄┄┄┄┄┄┄┄┄┄ │                           │
                                         │            │                     │ WhatsApp    │                           │
      ┌───────────┐                      │            │                     │ Signal      │                           │
      │    TUI    │◀────EventBus────────▶│            │                     │ ...         │                           │
      └───────────┘                      │            │                     └──────┬──────┘                           │
                                         │            │                            │                                  │
      ┌───────────┐                      │            │                            │ ChannelMessage                   │
      │ Dashboard │◀────EventBus────────▶│            ▼                            │ (common interface)               │
      └───────────┘                      │  ┌─────────────────────────────────────────────────────────────────────┐   │
                                         │  │                                                                     │   │
                                         │  │                              Server                                 │   │
                                         │  │                                                                     │   │
                                         │  │  ┌─────────────────────────────────────────┐       ┌─────────────┐  │   │
                                         │  │  │                  Agent                  │       │ Integrations│  │   │
                                         │  │  │               (LangGraph)               │──────▶│             │  │   │
                                         │  │  └──┬──────────┬──────────┬──────────┬────┘       └──────┬──────┘  │   │
                                         │  │     │          │          │          │                   │         │   │
                                         │  │     ▼          ▼          ▼          ▼                   ▼         │   │
                                         │  │  ┌──────┐ ┌────────┐ ┌────────┐ ┌─────────┐       ┌───────────┐    │   │
                                         │  │  │ Job  │ │ Config │ │Knowledge│ │  Audit  │       │  Toolbox  │    │   │
                                         │  │  │Managr│ │ Managr │ │ Manager│ │  Trail  │       │ ┄┄┄┄┄┄┄┄┄ │    │   │
                                         │  │  └──┬───┘ └───┬────┘ └───┬────┘ └────┬────┘       │ Gmail     │    │   │
                                         │  │     │         │          │           │            │ Calendar  │    │   │
                                         │  │     │         │          │           │            │ Tasks     │    │   │
                                         │  │     │         │          │           │            │ Files     │    │   │
                                         │  │     │         │          │           │            │ ...       │    │   │
                                         │  │     │         │          │           │            └───────────┘    │   │
                                         │  └─────┴─────────┴──────────┴───────────┴─────────────────────────────┘   │
                                         │                  │          │           │                                  │
                                         │                  ▼          ▼           ▼                                  │
                                         │             ◇─────────◇ ◇────────◇ ◇────────────◇                          │
                                         │             │ SQLite  │ │Prompts │ │ Structured │                          │
                                         │             │         │ │        │ │    Log     │                          │
                                         │             ◇─────────◇ ◇────────◇ ◇────────────◇                          │
                                         │                                                                            │
                                         └────────────────────────────────────────────────────────────────────────────┘

Legend:
  ┌─────────┐
  │ Package │  Package/Module
  └─────────┘

  ○           Frontend (external client)

  ◇─────────◇
  │ Storage │  Persistent storage
  ◇─────────◇
```

---

## Packages

### Current package map (repo state)

**Exists today:** `@otto/server` (Gateway), `@otto/agent`, `@otto/audit`, `@otto/configManager`, `@otto/knowledgeManager`, `@otto/integrationManager`, `@otto/shared`, `@otto/tuiClient`

**Planned/needed:** `@otto/jobManager` (Scheduler), `@otto/channels`, `@otto/memory`, `@otto/dashboardClient` (Integrations leaf packages TBD)

### Core Runtime

#### `@otto/server` (Gateway)

Entry point. Boots all subsystems, exposes WebSocket for clients.

**Responsibilities:**

- Initialize database connection
- Start Job Manager, Config Manager, etc.
- WebSocket endpoint for TUI/Dashboard
- Bridge EventBus to WebSocket connections
- Health check endpoint

**Dependencies:** All other packages

---

#### `@otto/agent`

The brain. LangGraph-based orchestration of LLM calls and tool execution.

**Responsibilities:**

- LangGraph definition and execution
- LLM provider abstraction (OpenAI, Mistral, Ollama)
- Two-phase tool loading (classify → execute)
- Stream responses to EventBus

**Key exports:**

```typescript
invokeAgent(opts: InvokeOptions): Promise<AgentResult>
streamAgent(opts: StreamOptions): void  // emits to EventBus
```

**Dependencies:** `@otto/shared`, `@otto/memory`, `@otto/configManager`, `@otto/knowledgeManager`, `@otto/integrations/*` (TBD), `@otto/audit`

---

#### `@otto/memory`

Conversation persistence and context management.

**Responsibilities:**

- Store/retrieve conversation history
- Summarize old conversations for context window
- Long-term user facts (preferences, timezone, etc.)

**Storage:** Markdown files + SQLite for metadata

**Key exports:**

```typescript
getConversationContext(sessionId: string): Promise<Message[]>
saveMessage(sessionId: string, message: Message): Promise<void>
getUserFacts(): Promise<Facts>
rememberFact(fact: string): Promise<void>
```

**Dependencies:** `@otto/shared`

---

#### `@otto/jobManager`

Cron-based scheduler for reminders and recurring tasks.

**Responsibilities:**

- Schedule/cancel jobs
- Persist jobs to survive restarts
- Execute jobs by calling Agent

**Key exports:**

```typescript
initJobs(): void
scheduleJob(def: JobDefinition): Job
cancelJob(id: string): void
listJobs(): Job[]
```

**Dependencies:** `@otto/shared`, `@otto/agent` (circular, handled via EventBus)

---

#### `@otto/configManager`

Configuration management. Supports modification via chat.

**Responsibilities:**

- Load config from file/database
- Validate with Zod schema
- Provide getters for other packages
- Update config (with audit trail)
- Manage prompts storage

**Key exports:**

```typescript
getConfig(): OttoConfig
updateConfig(patch: Partial<OttoConfig>): Promise<void>
getPrompt(name: string): string
updatePrompt(name: string, content: string): Promise<void>
```

**Dependencies:** `@otto/shared`, `@otto/audit`

---

#### `@otto/knowledgeManager`

Self-awareness. Tells Agent what Otto can do.

**Responsibilities:**

- Build capabilities manifest from enabled integrations
- Provide detailed capability descriptions on demand
- Read from docs/ for human-written descriptions

**Key exports:**

```typescript
getCapabilitiesManifest(): string  // ~100 tokens, always in context
describeCapability(name: string): string
listEnabledIntegrations(): Integration[]
```

**Dependencies:** `@otto/shared`, `@otto/integrationManager`

---

#### `@otto/audit`

Logging and permission enforcement.

**Responsibilities:**

- Log every tool execution
- Track token usage and costs
- Enforce autonomy tiers (confirm before destructive actions)
- Read permissions from config

**Key exports:**

```typescript
logToolUsage(tool: string, input: unknown, output: unknown, cost: Cost): void
requiresConfirmation(tool: string): boolean
getAuditLog(filters?: AuditFilters): AuditEntry[]
```

**Dependencies:** `@otto/shared`

---

#### `@otto/channels`

External messaging channels (WhatsApp, Signal, etc.).

**Responsibilities:**

- Connect to messaging platforms
- Normalize incoming messages to `ChannelMessage` type
- Route outgoing messages to correct channel
- Handle media (voice notes, images, files)

**Key exports:**

```typescript
initChannels(): Promise<void>
sendMessage(channel: string, to: string, content: MessageContent): Promise<void>
onMessage(handler: (msg: ChannelMessage) => void): void
```

**Common interface:**

```typescript
interface ChannelMessage {
  id: string;
  channel: "whatsapp" | "signal" | "tui" | "dashboard";
  from: string;
  content: string;
  media?: MediaAttachment[];
  timestamp: Date;
  replyFn: (response: string) => Promise<void>;
}
```

**Dependencies:** `@otto/shared`, `@otto/agent`

---

### Integrations

#### `@otto/integrationManager`

Framework for building integrations.

**Responsibilities:**

- Define `Integration` and `Tool` interfaces
- Registry for loading/enabling integrations
- Autonomy tier definitions

**Key exports:**

```typescript
defineIntegration(config: IntegrationConfig): Integration
getEnabledTools(): Tool[]
getToolsForDomain(domain: string): Tool[]
```

**Integration interface:**

```typescript
interface IntegrationConfig {
  name: string;
  displayName: string;
  description: string;
  configSchema: ZodSchema;

  setup: (config: Config) => Promise<Context>;
  teardown?: () => Promise<void>;

  tools: Tool[];
  capabilities: string[]; // For manifest

  autonomyTiers: Record<string, 1 | 2 | 3>;
  // 1 = autonomous, 2 = confirm first, 3 = always ask
}
```

---

#### `@otto/integrations/google`

Gmail and Google Calendar integration.

**Tools:**

- `gmail:list` — List recent emails
- `gmail:read` — Read email content
- `gmail:send` — Send email (Tier 2)
- `gmail:archive` — Archive email
- `calendar:list` — List upcoming events
- `calendar:get` — Get event details
- `calendar:create` — Create event (Tier 2)
- `calendar:update` — Update event (Tier 2)
- `calendar:delete` — Delete event (Tier 3)

---

#### `@otto/integrations/tasks`

Task management (Google Tasks or local).

**Tools:**

- `tasks:list` — List tasks
- `tasks:create` — Create task
- `tasks:complete` — Mark complete
- `tasks:delete` — Delete task

---

#### `@otto/integrations/filesystem`

Sandboxed file access.

**Tools:**

- `fs:read` — Read file contents
- `fs:write` — Write file (Tier 2)
- `fs:list` — List directory

**Security:** Only allowed paths (configured in config)

---

### Clients

#### `@otto/tuiClient`

Terminal-based chat interface.

**Tech:** ink (React for CLI)

**Features:**

- Streaming token display
- Connection status
- Confirmation prompts for Tier 2 actions
- Command history

**Key files:**

```
src/
├── index.tsx       # Entry
├── App.tsx         # Main component
├── components/
│   ├── Chat.tsx    # Message list
│   ├── Input.tsx   # User input
│   └── Status.tsx  # Connection indicator
└── hooks/
    └── useWebSocket.ts
```

---

#### `@otto/dashboardClient`

Web-based management UI.

**Tech:** React + Vite + Tailwind

**Features:**

- Chat interface (same as TUI)
- Job management
- Audit log viewer
- Configuration editor
- Cost tracking

---

### Shared

#### `@otto/shared`

Cross-cutting concerns used by all packages.

**Contents:**

- `db/` — SQLite connection, Drizzle schema, migrations
- `events.ts` — EventBus (EventEmitter)
- `logger.ts` — Pino structured logging
- `types/` — Shared TypeScript types

**Storage note:** Storage is not its own package; persistent storage lives in `@otto/shared`.

---

## Data Flow

### User message via TUI/Dashboard

```
User types message
       │
       ▼
   TUI/Dashboard
       │
       │ WebSocket
       ▼
   Server
       │
       │ direct call
       ▼
   Agent.streamAgent({ message, sessionId })
       │
       ├──▶ Memory.getContext()
       │
       ├──▶ Knowledge.getCapabilitiesManifest()
       │
       ├──▶ LLM call (phase 1: classify intent)
       │
       ├──▶ Integrations.getToolsForDomain()
       │
       ├──▶ LLM call (phase 2: execute with tools)
       │         │
       │         ├──▶ Tool execution
       │         │         │
       │         │         └──▶ Audit.logToolUsage()
       │         │
       │         └──▶ (repeat for each tool call)
       │
       ├──▶ Memory.saveMessage()
       │
       └──▶ EventBus.emit(sessionId, chunk)
                   │
                   ▼
              Server (subscribed)
                   │
                   │ WebSocket
                   ▼
              TUI/Dashboard displays response
```

### User message via WhatsApp

```
User sends WhatsApp message
       │
       ▼
   Channels/WhatsApp (Baileys)
       │
       │ normalizes to ChannelMessage
       ▼
   Agent.streamAgent({ message, channelId, replyFn })
       │
       │ (same flow as above, but...)
       │
       └──▶ replyFn(accumulatedResponse)
                   │
                   ▼
              Channels/WhatsApp.send()
                   │
                   ▼
              User receives WhatsApp reply
```

### Proactive job execution

```
Croner fires scheduled job
       │
       ▼
   Jobs.executeJob(jobId)
       │
       │ loads job definition
       ▼
   Agent.streamAgent({ message: job.prompt, sessionId: job.target })
       │
       │ (same flow as user message)
       │
       └──▶ Routes to correct output:
            ├── EventBus (if TUI/Dashboard session active)
            └── Channel (if WhatsApp/Signal configured)
```

---

## Storage

### SQLite (`data/otto.db`)

```
conversations
├── id              TEXT PRIMARY KEY
├── channel         TEXT (whatsapp|signal|tui|dashboard)
├── external_id     TEXT (channel-specific identifier)
├── created_at      DATETIME
└── updated_at      DATETIME

messages
├── id              TEXT PRIMARY KEY
├── conversation_id TEXT REFERENCES conversations
├── role            TEXT (user|assistant|system|tool)
├── content         TEXT
├── tool_calls      JSON (nullable)
└── created_at      DATETIME

jobs
├── id              TEXT PRIMARY KEY
├── type            TEXT (reminder|recurring|trigger)
├── cron            TEXT (nullable, for recurring)
├── next_run        DATETIME
├── payload         JSON
├── enabled         BOOLEAN
├── created_at      DATETIME
└── updated_at      DATETIME

user_profile
├── key             TEXT PRIMARY KEY
├── value           JSON
└── updated_at      DATETIME

audit_log
├── id              TEXT PRIMARY KEY
├── action          TEXT
├── tool            TEXT (nullable)
├── input           JSON
├── output          JSON
├── tokens_in       INTEGER
├── tokens_out      INTEGER
├── cost_usd        REAL
├── created_at      DATETIME
└── session_id      TEXT
```

### Prompts (`data/prompts/`)

```
data/prompts/
├── system.md           # Main system prompt
├── capabilities.md     # Auto-generated from integrations
└── personality.md      # Otto's character
```

### Memory (`data/memory/`)

```
data/memory/
├── facts.md            # Long-term user facts
├── preferences.md      # User preferences
└── conversations/      # Summarized old conversations
    ├── 2026-01-30.md
    └── ...
```

### Credentials (`data/credentials/`)

```
data/credentials/
├── google.json         # OAuth tokens
└── whatsapp/           # Baileys session
```

---

## WebSocket Protocol

Both TUI and Dashboard use the same protocol.

### Client → Server

```typescript
// Send a message
{ type: 'message', content: string }

// Respond to confirmation request
{ type: 'confirm', actionId: string, approved: boolean }

// Cancel pending action
{ type: 'cancel', actionId: string }

// Keepalive
{ type: 'ping' }
```

### Server → Client

```typescript
// Streaming token
{ type: 'chunk', content: string }

// Stream complete
{ type: 'done', messageId: string }

// Request confirmation for Tier 2 action
{
  type: 'confirm_request',
  actionId: string,
  tool: string,
  description: string,
  preview: Record<string, unknown>
}

// Action was confirmed and executed
{ type: 'confirmed', actionId: string }

// Action was cancelled
{ type: 'cancelled', actionId: string }

// Error
{ type: 'error', message: string, code?: string }

// Keepalive response
{ type: 'pong' }
```

---

## Autonomy Tiers

Tools are assigned autonomy tiers that determine whether Otto acts independently or asks first.

| Tier  | Behavior      | Examples                                 |
| ----- | ------------- | ---------------------------------------- |
| **1** | Autonomous    | Read email, list calendar, search memory |
| **2** | Confirm first | Send email, create event, write file     |
| **3** | Always ask    | Delete anything, financial actions       |

Configured per-tool in integration definitions. User can override in config.

---

## Context Management

LLM context is expensive. Otto uses a two-phase approach to keep context small.

### Phase 1: Classify

Small context (~100-200 tokens):

- Capabilities manifest ("Otto can: EMAIL, CALENDAR, TASKS...")
- User message

LLM determines which domain(s) are needed.

### Phase 2: Execute

Load only relevant tools:

- User asked about calendar → load only `@otto/integrations/google` calendar tools
- Not the full 20+ tools from all integrations

Result: ~500-1000 tokens vs ~5000+ tokens, better accuracy.

---

## Implementation Phases

### Phase 0+1: Foundation + Talk to Otto

**Goal:** Working chat via TUI

```
packages/
├── shared/         # Types, EventBus, basic setup
├── server/         # Fastify, WebSocket
├── agent/          # LangGraph, single LLM (no tools)
└── tuiClient/      # Basic chat
```

### Phase 2: Memory

**Goal:** Conversations persist

```
packages/
├── shared/         # + SQLite, Drizzle schema
└── memory/         # Store/retrieve history
```

### Phase 3: First Tool

**Goal:** Otto can do something

```
packages/
├── integrationManager/ # Framework
└── audit/              # Log tool usage
```

Integrations leaf packages (e.g., filesystem) are TBD.

### Phase 4: Knowledge

**Goal:** Otto knows itself

```
packages/
├── knowledgeManager/ # Capability manifest
└── configManager/    # Config management
```

### Phase 5: Jobs

**Goal:** Reminders work

```
packages/
└── jobManager/     # Croner scheduler
```

### Phase 6: External Integrations

**Goal:** Gmail, Calendar

```
packages/
└── integrations/google/     # OAuth, Gmail, Calendar tools (TBD)
```

### Phase 7: Channels

**Goal:** WhatsApp works

```
packages/
└── channels/       # WhatsApp via Baileys
```

### Phase 8: Dashboard

**Goal:** Web UI

```
packages/
└── dashboardClient/  # React web app
```

---

## Tech Stack

| Concern           | Choice           | Rationale                                 |
| ----------------- | ---------------- | ----------------------------------------- |
| Runtime           | Node.js 22+      | LangChain.js ecosystem, TypeScript        |
| Framework         | Fastify          | Fast, plugin-based, WebSocket support     |
| LLM Orchestration | LangGraph.js     | Stateful agents, human-in-loop, streaming |
| Database          | SQLite + Drizzle | Single file, type-safe, no server         |
| Scheduler         | Croner           | Lightweight, in-process cron              |
| WhatsApp          | Baileys          | Unofficial but works                      |
| TUI               | ink              | React patterns for terminal               |
| Dashboard         | React + Vite     | Standard, fast                            |
| Logging           | Pino             | Structured, fast                          |
| Validation        | Zod              | Runtime + TypeScript inference            |

### LLM Providers (user choice)

| Provider | Models                  | Use Case             |
| -------- | ----------------------- | -------------------- |
| OpenAI   | gpt-4o, gpt-4o-mini     | Best capability      |
| Mistral  | mistral-small-latest    | European, affordable |
| Ollama   | qwen2.5:3b, llama3.2:3b | Local, private       |

---

## Directory Structure

```
otto/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .env.example
├── .gitignore
│
├── packages/
│   ├── server/             # Gateway
│   ├── agent/
│   ├── memory/
│   ├── jobManager/
│   ├── configManager/
│   ├── knowledgeManager/
│   ├── audit/
│   ├── channels/
│   ├── integrationManager/
│   ├── tuiClient/
│   ├── dashboardClient/
│   └── shared/
│
├── data/                   # Runtime, gitignored
│   ├── otto.db
│   ├── prompts/
│   ├── memory/
│   └── credentials/
│
└── docs/                   # Internal docs for Knowledge Manager
    ├── capabilities.md
    └── integrations/
```

---

## Security Considerations

- **File access** — Sandboxed to configured paths only
- **Credentials** — Stored in `data/credentials/`, gitignored
- **Audit trail** — Every tool execution logged
- **Autonomy tiers** — Destructive actions require confirmation
- **Pairing** — WhatsApp requires QR code scan (physical access)
- **No remote access** — TUI/Dashboard are local or via your own tunnel

---

## Future Considerations

- **Voice transcription** — Whisper API for voice notes
- **Proactive messages** — Morning briefings, event reminders
- **More channels** — Signal, Telegram, iMessage
- **More integrations** — Notion, Todoist, Home Assistant
- **Local LLM improvements** — Better models for Pi
- **Multi-user** — Family support (distinct profiles)
