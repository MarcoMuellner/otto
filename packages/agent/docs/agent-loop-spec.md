ticket: TICKET-AGENT-LOOP
solution: LangGraph-based reusable agent loop with policy gating

# What we're building

approach: |

- Normalize input into messages + media refs
- Assemble context from memory/profile/RAG
- Classify domains and plan tool usage
- Enforce allow/deny policy before tool execution
- Execute tools, compose response, persist audit + messages

# Key decisions

decisions:

- Use LangGraph for state + checkpoints to support async later
- Keep memory/RAG outside the graph; inject context per run

# Watch out for

gotchas:

- Media must be referenced, not blindly inlined
- Tool policy must be checked before any execution
