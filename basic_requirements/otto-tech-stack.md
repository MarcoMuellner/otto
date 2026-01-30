# Otto - Tech Stack & Model Decisions

> Technical decisions for Otto's implementation. Companion to `REQUIREMENTS.md`.

**Version:** 0.1.0  
**Last Updated:** 2026-01-29  
**Status:** Draft

---

## 1. Overview

This document captures the technical stack decisions for Otto, with emphasis on:
- LLM provider flexibility (easy switching between providers)
- Local model support (Ollama) as a first-class citizen
- Framework choices (LangChain/LangGraph ecosystem)

### Design Principle

**User chooses their provider.** Otto doesn't make assumptions about which model to use. The user configures their preferred provider, and Otto uses it consistently. No magic routing, no hidden decisions.

---

## 2. Runtime & Language

### Core Stack

| Component | Choice | Version | Rationale |
|-----------|--------|---------|-----------|
| **Runtime** | Node.js | 22+ LTS | Modern features, good async support, matches user preference |
| **Language** | TypeScript | 5.x | Type safety, better DX, catches errors early |
| **Package Manager** | pnpm | 8+ | Fast, disk-efficient, good monorepo support |

### Why Node.js (Not Python)

LangChain/LangGraph have excellent TypeScript support. While Python has more examples, the JS ecosystem is:
- More natural for WhatsApp/Telegram integrations (Baileys is JS)
- Better for real-time/streaming use cases
- Matches the user's stated preference

---

## 3. LLM Framework

### LangChain.js + LangGraph.js

```
┌─────────────────────────────────────────────────────────────┐
│                     LANGCHAIN ECOSYSTEM                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  @langchain/core         Core abstractions, messages        │
│  @langchain/langgraph    Stateful agent orchestration       │
│  @langchain/openai       OpenAI provider                    │
│  @langchain/mistralai    Mistral provider                   │
│  @langchain/ollama       Local models via Ollama            │
│  @langchain/anthropic    Anthropic provider (optional)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Why LangGraph

| Feature | Otto Use Case |
|---------|---------------|
| **Stateful graphs** | Conversation flows, multi-turn interactions |
| **Checkpointing** | Persist state, resume after crashes |
| **Human-in-the-loop** | Confirmation flows (Tier 2/3 actions) |
| **Tool calling** | Integration with Gmail, Calendar, etc. |
| **Streaming** | Real-time responses to WhatsApp |
| **Provider agnostic** | Same graph works with any LLM |

### Key Packages

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.x",
    "@langchain/langgraph": "^0.3.x",
    "@langchain/openai": "^0.4.x",
    "@langchain/mistralai": "^0.1.x",
    "@langchain/ollama": "^0.1.x"
  }
}
```

---

## 4. LLM Providers

### Supported Providers (V1)

Otto supports multiple LLM providers out of the box. User configures their choice.

#### 4.1 OpenAI

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
});
```

**Available Models:**
| Model | Best For | Cost |
|-------|----------|------|
| `gpt-4o` | General purpose, tool calling | ~$5/M input |
| `gpt-4o-mini` | Cost-effective, fast | ~$0.15/M input |
| `gpt-4-turbo` | Complex reasoning | ~$10/M input |

**Pros:** Excellent tool calling, reliable, well-documented
**Cons:** US-based, privacy concerns, cost at scale

---

#### 4.2 Mistral AI

```typescript
import { ChatMistralAI } from "@langchain/mistralai";

const model = new ChatMistralAI({
  model: "mistral-small-latest",
  temperature: 0.7,
});
```

**Available Models:**
| Model | Parameters | Best For | Cost |
|-------|------------|----------|------|
| `mistral-small-latest` | 24B | Fast responses, function calling | ~$0.2/M input |
| `mistral-medium-latest` | — | Balanced performance | ~$0.7/M input |
| `mistral-large-latest` | — | Complex reasoning | ~$2/M input |
| `codestral-latest` | — | Code generation | ~$0.3/M input |

**Pros:** European (GDPR-friendly), excellent cost/performance, good tool calling, open-weight models available
**Cons:** Smaller ecosystem than OpenAI

**Recommendation:** Good default choice for European users. Mistral Small offers excellent value.

---

#### 4.3 Ollama (Local)

```typescript
import { ChatOllama } from "@langchain/ollama";

const model = new ChatOllama({
  baseUrl: "http://localhost:11434",
  model: "qwen2.5:3b",
  temperature: 0.7,
});
```

**Recommended Models for Local Use:**

| Model | Parameters | Size | RAM | Tool Calling | Pi 5 (8GB) |
|-------|------------|------|-----|--------------|------------|
| `tinyllama:1.1b` | 1.1B | ~700MB | 2GB | ❌ Limited | ✅ Fast |
| `phi-2` | 2.7B | ~1.5GB | 4GB | ❌ Limited | ✅ ~4 tok/s |
| `qwen2.5:3b` | 3B | ~2GB | 4GB | ✅ Yes | ✅ Good |
| `llama3.2:3b` | 3B | ~2GB | 4GB | ✅ Yes | ✅ Good |
| `mistral:7b-instruct-q4_0` | 7B | ~4GB | 8GB | ✅ Yes | ⚠️ ~2 tok/s |
| `mistral:7b` | 7B | ~4GB | 8GB | ✅ Yes | ⚠️ Slow |

**Pros:** Completely private, no API costs, works offline
**Cons:** Slower, requires local hardware, limited model sizes on Pi

**Recommendation for Raspberry Pi 5:** Start with `qwen2.5:3b` or `llama3.2:3b`. Both have good tool calling support and reasonable speed.

---

#### 4.4 Anthropic (Optional)

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-20250514",
  temperature: 0.7,
});
```

**Note:** Included for completeness. User can add if they prefer Claude.

---

### Provider Configuration

User configures their provider in Otto's config:

```typescript
interface LLMConfig {
  // Which provider to use
  provider: 'openai' | 'mistral' | 'ollama' | 'anthropic';
  
  // Provider-specific settings
  openai?: {
    apiKey: string;           // From env: OPENAI_API_KEY
    model: string;            // e.g., "gpt-4o"
    organization?: string;
  };
  
  mistral?: {
    apiKey: string;           // From env: MISTRAL_API_KEY
    model: string;            // e.g., "mistral-small-latest"
  };
  
  ollama?: {
    baseUrl: string;          // e.g., "http://localhost:11434"
    model: string;            // e.g., "qwen2.5:3b"
  };
  
  anthropic?: {
    apiKey: string;           // From env: ANTHROPIC_API_KEY
    model: string;            // e.g., "claude-sonnet-4-20250514"
  };
  
  // Common settings
  temperature: number;        // 0.0 - 1.0, default 0.7
  maxTokens: number;          // Max response length
}
```

### Provider Factory

```typescript
// src/llm/provider.ts
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";

export function createModel(config: LLMConfig): BaseChatModel {
  const common = {
    temperature: config.temperature ?? 0.7,
    maxTokens: config.maxTokens,
  };

  switch (config.provider) {
    case 'openai':
      return new ChatOpenAI({
        ...common,
        model: config.openai!.model,
        openAIApiKey: config.openai!.apiKey,
      });
      
    case 'mistral':
      return new ChatMistralAI({
        ...common,
        model: config.mistral!.model,
        apiKey: config.mistral!.apiKey,
      });
      
    case 'ollama':
      return new ChatOllama({
        ...common,
        baseUrl: config.ollama!.baseUrl,
        model: config.ollama!.model,
      });
      
    case 'anthropic':
      return new ChatAnthropic({
        ...common,
        model: config.anthropic!.model,
        anthropicApiKey: config.anthropic!.apiKey,
      });
      
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

---

## 5. Embeddings (for RAG)

### Local Embeddings via Ollama

```typescript
import { OllamaEmbeddings } from "@langchain/ollama";

const embeddings = new OllamaEmbeddings({
  baseUrl: "http://localhost:11434",
  model: "nomic-embed-text",  // 137M params, good quality
});
```

**Recommended Embedding Models:**

| Model | Dimensions | Size | Quality |
|-------|------------|------|---------|
| `nomic-embed-text` | 768 | ~275MB | ✅ Excellent |
| `mxbai-embed-large` | 1024 | ~670MB | ✅ Very good |
| `all-minilm` | 384 | ~45MB | ⚠️ Okay |

### Cloud Embeddings (Alternative)

```typescript
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",  // $0.02/M tokens
});
```

### Configuration

```typescript
interface EmbeddingsConfig {
  provider: 'ollama' | 'openai' | 'mistral';
  
  ollama?: {
    baseUrl: string;
    model: string;            // e.g., "nomic-embed-text"
  };
  
  openai?: {
    apiKey: string;
    model: string;            // e.g., "text-embedding-3-small"
  };
}
```

**Recommendation:** Use Ollama with `nomic-embed-text` for fully local RAG. Falls back to OpenAI if local not available.

---

## 6. Vector Store (for RAG)

### SQLite with Vector Extensions

For a lightweight, Raspberry Pi-friendly setup:

```typescript
// Option 1: sqlite-vss (SQLite Vector Similarity Search)
import { SQLiteVSS } from "langchain/vectorstores/sqlitevss";

// Option 2: LanceDB (embedded vector DB)
import { LanceDB } from "@langchain/community/vectorstores/lancedb";
```

**Comparison:**

| Store | Pros | Cons |
|-------|------|------|
| **sqlite-vss** | Single file, SQLite native | Newer, less documented |
| **LanceDB** | Fast, good DX, Arrow-based | Separate binary |
| **ChromaDB** | Popular, well-documented | Requires separate server |

**Recommendation:** Start with **LanceDB** - good balance of simplicity and performance, works well on ARM.

### Schema

```typescript
interface MemoryDocument {
  id: string;
  content: string;           // The text content
  embedding: number[];       // Vector embedding
  metadata: {
    type: 'conversation' | 'fact' | 'preference';
    timestamp: Date;
    source: string;          // e.g., "whatsapp", "user-edit"
    tags?: string[];
  };
}
```

---

## 7. Database

### SQLite

Primary database for all structured data.

```typescript
// Using better-sqlite3 for sync operations
import Database from 'better-sqlite3';

// Or Drizzle ORM for type-safe queries
import { drizzle } from 'drizzle-orm/better-sqlite3';
```

**Tables:**
- `conversations` - Message history
- `user_profile` - Facts, preferences
- `audit_log` - Action history
- `config` - Otto configuration
- `tasks` - Scheduled jobs

**Why SQLite:**
- Single file, easy backup
- No separate server process
- Works great on Raspberry Pi
- Drizzle ORM for type safety

---

## 8. Messaging Channels

### WhatsApp (V1)

```typescript
// Using Baileys (WhatsApp Web protocol)
import makeWASocket from "@whiskeysockets/baileys";
```

**Package:** `@whiskeysockets/baileys`

**Note:** Baileys is unofficial. Consider risks:
- May break with WhatsApp updates
- Meta could block
- Not suitable for business-critical use

### Channel Abstraction

```typescript
// src/channels/types.ts
interface Channel {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  onMessage(handler: MessageHandler): void;
  sendText(to: string, text: string): Promise<void>;
  sendFile(to: string, file: Buffer, filename: string): Promise<void>;
  
  capabilities: {
    voice: boolean;
    files: boolean;
    images: boolean;
    reactions: boolean;
  };
}

// src/channels/whatsapp.ts
class WhatsAppChannel implements Channel { ... }

// src/channels/telegram.ts (future)
class TelegramChannel implements Channel { ... }
```

---

## 9. Voice Transcription

### Whisper via OpenAI API

```typescript
import OpenAI from "openai";

const openai = new OpenAI();

async function transcribe(audioBuffer: Buffer): Promise<string> {
  const transcription = await openai.audio.transcriptions.create({
    file: audioBuffer,
    model: "whisper-1",
  });
  return transcription.text;
}
```

### Local Whisper (Future)

For fully local operation:
- `whisper.cpp` - C++ port, runs on Pi
- `faster-whisper` - Python, optimized

**Recommendation:** Start with OpenAI Whisper API (simple, reliable). Add local option later.

---

## 10. Project Structure

```
otto/
├── package.json
├── tsconfig.json
├── .env.example
│
├── src/
│   ├── index.ts              # Entry point
│   │
│   ├── config/
│   │   ├── schema.ts         # Config type definitions
│   │   ├── loader.ts         # Load from file/env
│   │   └── defaults.ts       # Default values
│   │
│   ├── llm/
│   │   ├── provider.ts       # Model factory
│   │   ├── embeddings.ts     # Embedding factory
│   │   └── tools/            # LangChain tools
│   │       ├── gmail.ts
│   │       ├── calendar.ts
│   │       └── tasks.ts
│   │
│   ├── agent/
│   │   ├── graph.ts          # LangGraph definition
│   │   ├── nodes/            # Graph nodes
│   │   │   ├── process.ts    # Message processing
│   │   │   ├── confirm.ts    # Human confirmation
│   │   │   └── execute.ts    # Tool execution
│   │   └── state.ts          # Agent state schema
│   │
│   ├── channels/
│   │   ├── types.ts          # Channel interface
│   │   ├── whatsapp.ts       # WhatsApp implementation
│   │   └── manager.ts        # Channel orchestration
│   │
│   ├── memory/
│   │   ├── store.ts          # Vector store
│   │   ├── retriever.ts      # RAG retrieval
│   │   └── profile.ts        # User profile management
│   │
│   ├── storage/
│   │   ├── database.ts       # SQLite setup
│   │   ├── schema.ts         # Drizzle schema
│   │   └── migrations/       # DB migrations
│   │
│   ├── scheduler/
│   │   ├── cron.ts           # Scheduled jobs
│   │   ├── heartbeat.ts      # Health checks
│   │   └── triggers.ts       # Event triggers
│   │
│   ├── gateway/
│   │   ├── server.ts         # HTTP/WS server
│   │   ├── routes.ts         # API routes
│   │   └── auth.ts           # Authentication
│   │
│   └── utils/
│       ├── logger.ts
│       ├── audit.ts
│       └── cost.ts           # Token tracking
│
├── data/                     # Runtime data (gitignored)
│   ├── otto.db               # SQLite database
│   ├── vectors/              # LanceDB data
│   └── credentials/          # Channel credentials
│
└── tests/
    ├── unit/
    └── integration/
```

---

## 11. Dependencies Summary

### Core

```json
{
  "dependencies": {
    // LLM Framework
    "@langchain/core": "^0.3.x",
    "@langchain/langgraph": "^0.3.x",
    "@langchain/openai": "^0.4.x",
    "@langchain/mistralai": "^0.1.x",
    "@langchain/ollama": "^0.1.x",
    
    // Database
    "better-sqlite3": "^11.x",
    "drizzle-orm": "^0.35.x",
    
    // Vector Store
    "lancedb": "^0.8.x",
    
    // WhatsApp
    "@whiskeysockets/baileys": "^6.x",
    
    // Server
    "fastify": "^5.x",
    "@fastify/websocket": "^10.x",
    
    // Utilities
    "zod": "^3.x",
    "pino": "^9.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "drizzle-kit": "^0.25.x",
    "vitest": "^2.x",
    "@types/node": "^22.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

---

## 12. Environment Variables

```bash
# .env.example

# LLM Provider (choose one as primary)
LLM_PROVIDER=mistral  # openai | mistral | ollama | anthropic

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-small-latest

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b

# Anthropic (optional)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Embeddings
EMBEDDINGS_PROVIDER=ollama  # ollama | openai
EMBEDDINGS_MODEL=nomic-embed-text

# Database
DATABASE_PATH=./data/otto.db

# Server
GATEWAY_PORT=18789
GATEWAY_HOST=127.0.0.1

# Security
AUTH_SECRET=...  # Generate with: openssl rand -hex 32

# integrationManager
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 13. Raspberry Pi Considerations

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Model | Pi 4 | Pi 5 |
| RAM | 4GB | 8GB |
| Storage | 32GB SD | 128GB NVMe SSD |
| Cooling | Passive | Active fan |

### Performance Expectations

| Model | Pi 5 (8GB) Speed | Notes |
|-------|------------------|-------|
| TinyLlama 1.1B | ~10 tok/s | Fast, limited capability |
| Qwen2.5 3B | ~4-6 tok/s | Good balance |
| Mistral 7B Q4 | ~2 tok/s | Slow but capable |

### Optimizations

1. **Use NVMe SSD** - SD cards are too slow for model loading
2. **Quantized models** - Always use Q4 or Q5 quantization
3. **Keep model loaded** - Ollama keeps model in memory
4. **Active cooling** - LLM inference generates heat
5. **Swap disabled** - Swap kills performance, get enough RAM

### Ollama on Pi Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a lightweight model
ollama pull qwen2.5:3b

# Verify
ollama list
```

---

## 14. Migration Path

### V1: Cloud-First
- OpenAI or Mistral as primary
- Simple setup, reliable
- Cost: ~$5-20/month typical usage

### V2: Hybrid
- Add Ollama support
- Local for simple tasks
- Cloud fallback for complex

### V3: Local-First
- Ollama as primary
- Cloud only when needed
- Fully private option

---

## 15. Open Questions

1. **LangGraph checkpointer:** Use SQLite or separate store?
2. **Streaming:** How to stream LLM responses through WhatsApp?
3. **Model switching:** Allow changing models per-conversation?
4. **Cost alerts:** Real-time or daily summary?

---

## Appendix A: Quick Start Commands

```bash
# Clone and install
git clone https://github.com/xxx/otto
cd otto
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
pnpm db:migrate

# Start Ollama (if using local)
ollama serve

# Start Otto
pnpm dev
```

---

## Appendix B: Provider Comparison

| Aspect | OpenAI | Mistral | Ollama | Anthropic |
|--------|--------|---------|--------|-----------|
| **Latency** | ~500ms | ~400ms | ~2-10s | ~600ms |
| **Cost** | $$$ | $$ | Free | $$$ |
| **Privacy** | Cloud | Cloud (EU) | Local | Cloud |
| **Tool calling** | ✅ Excellent | ✅ Good | ⚠️ Varies | ✅ Good |
| **Streaming** | ✅ | ✅ | ✅ | ✅ |
| **Offline** | ❌ | ❌ | ✅ | ❌ |

---

*This document will evolve as we make implementation decisions.*
