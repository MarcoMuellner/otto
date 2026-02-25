import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Link, useLoaderData } from "react-router"
import { toast } from "sonner"

import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js"
import { Switch } from "../components/ui/switch.js"
import {
  chatMessagesResponseSchema,
  chatStreamEventSchema,
  chatThreadsResponseSchema,
  createChatThreadResponseSchema,
  type ChatStreamEvent,
  type ChatMessage,
  type ChatThread,
  type ChatThreadsResponse,
} from "../features/chat/contracts.js"
import { formatDateTime } from "../lib/date-time.js"
import { createChatSurfaceService } from "../server/chat-surface.server.js"

type ChatLoaderData =
  | {
      status: "success"
      payload: ChatThreadsResponse
    }
  | {
      status: "error"
      message: string
      payload: ChatThreadsResponse
    }

const emptyThreadsPayload: ChatThreadsResponse = {
  threads: [],
  degraded: false,
}

const NEW_DRAFT_KEY = "__new__"

export const loader = async (): Promise<ChatLoaderData> => {
  try {
    const service = createChatSurfaceService()
    const payload = await service.listThreads()
    return {
      status: "success",
      payload,
    }
  } catch {
    return {
      status: "error",
      message: "Could not load chat threads right now. Check OpenCode availability.",
      payload: {
        ...emptyThreadsPayload,
        degraded: true,
      },
    }
  }
}

const parseErrorMessage = (body: unknown, fallback: string): string => {
  if (body && typeof body === "object") {
    const candidate = body as {
      message?: unknown
      error?: unknown
    }

    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return candidate.message
    }

    if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
      return candidate.error
    }
  }

  return fallback
}

const fetchThreads = async (): Promise<ChatThreadsResponse> => {
  const response = await fetch("/api/chat/threads", { method: "GET" })
  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not load chat threads"))
  }

  return chatThreadsResponseSchema.parse(body)
}

const createThread = async (): Promise<ChatThread> => {
  const response = await fetch("/api/chat/threads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  })

  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not create chat thread"))
  }

  return createChatThreadResponseSchema.parse(body).thread
}

const fetchMessages = async (threadId: string) => {
  const response = await fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "GET",
  })

  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not load chat messages"))
  }

  return chatMessagesResponseSchema.parse(body)
}

const streamMessage = async (
  threadId: string,
  text: string,
  onEvent: (event: ChatStreamEvent) => void
) => {
  const response = await fetch(
    `/api/chat/threads/${encodeURIComponent(threadId)}/messages/stream`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
    }
  )

  if (!response.ok) {
    const body = (await response.json()) as unknown
    throw new Error(parseErrorMessage(body, "Could not send message"))
  }

  if (!response.body) {
    throw new Error("Streaming response body is not available")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }

      buffer += decoder.decode(chunk.value, { stream: true })

      while (true) {
        const newLineIndex = buffer.indexOf("\n")
        if (newLineIndex < 0) {
          break
        }

        const line = buffer.slice(0, newLineIndex).trim()
        buffer = buffer.slice(newLineIndex + 1)
        if (line.length === 0) {
          continue
        }

        const event = chatStreamEventSchema.parse(JSON.parse(line) as unknown)
        onEvent(event)
      }
    }

    const trailing = buffer.trim()
    if (trailing.length > 0) {
      const event = chatStreamEventSchema.parse(JSON.parse(trailing) as unknown)
      onEvent(event)
    }
  } finally {
    await reader.cancel()
  }
}

const resolveMessageTone = (role: ChatMessage["role"]): string => {
  if (role === "assistant") {
    return "border-[rgba(20,114,70,0.2)] bg-[rgba(230,248,237,0.7)]"
  }

  if (role === "user") {
    return "border-[rgba(26,26,26,0.12)] bg-white"
  }

  return "border-[rgba(26,26,26,0.08)] bg-[rgba(246,246,246,0.9)]"
}

const nonInteractiveTitlePattern =
  /\b(heartbeat|health\s*check|scheduler|scheduled|cron|job(?:\s+run)?|automation)\b/iu

const isInteractiveLaneThread = (thread: ChatThread): boolean => {
  const hasSchedulerBinding = thread.bindings.some((binding) => binding.source === "scheduler")
  if (hasSchedulerBinding) {
    return false
  }

  const hasUnknownBinding = thread.bindings.some((binding) => binding.source === "unknown")
  if (hasUnknownBinding) {
    return false
  }

  const hasTelegramBinding = thread.bindings.some((binding) => binding.source === "telegram")
  if (hasTelegramBinding) {
    return true
  }

  return !nonInteractiveTitlePattern.test(thread.title)
}

type MessageBlock = {
  kind: "text" | "reasoning" | "tool" | "json"
  content: string
  label?: string
}

const stripBasicMarkdown = (input: string): string => {
  return input
    .replace(/^\*\*(.*?)\*\*$/gmu, "$1")
    .replace(/\*\*(.*?)\*\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .trim()
}

const extractLeakedAssistantReasoning = (
  role: ChatMessage["role"],
  text: string
): { reasoning: string; response: string } | null => {
  if (role !== "assistant") {
    return null
  }

  const trimmed = text.trim()
  if (trimmed.length < 80) {
    return null
  }

  const metaCuePattern =
    /\b(the user|i should|i need to|i can keep|i can go with|there's no need)\b/iu
  if (!metaCuePattern.test(trimmed)) {
    return null
  }

  const paragraphSplit = trimmed.split(/\n{2,}/u).map((part) => part.trim())
  if (paragraphSplit.length >= 2) {
    const candidateResponse = paragraphSplit.at(-1) ?? ""
    const candidateReasoning = paragraphSplit.slice(0, -1).join("\n\n").trim()

    if (candidateReasoning.length > 0 && candidateResponse.length > 0) {
      return {
        reasoning: candidateReasoning,
        response: candidateResponse,
      }
    }
  }

  const responseStartPattern =
    /\b(Yep\b|Sure\b|Okay\b|Great\b|What(?:'|’)?s\b|What is\b|How can I\b|I can help\b|Let me\b|Here(?:'|’)?s\b|Here is\b)/u
  const match = responseStartPattern.exec(trimmed)
  if (!match || match.index < 40) {
    return null
  }

  const reasoning = trimmed.slice(0, match.index).trim()
  const response = trimmed.slice(match.index).trim()
  if (reasoning.length === 0 || response.length === 0) {
    return null
  }

  return {
    reasoning,
    response,
  }
}

const tryFormatJson = (candidate: string): string | null => {
  const trimmed = candidate.trim()
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    return null
  }
}

const splitTextIntoRichBlocks = (text: string, role: ChatMessage["role"]): MessageBlock[] => {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return []
  }

  const reasoningLeak = extractLeakedAssistantReasoning(role, trimmed)
  if (reasoningLeak) {
    return [
      {
        kind: "reasoning",
        label: "Model draft",
        content: stripBasicMarkdown(reasoningLeak.reasoning),
      },
      {
        kind: "text",
        content: stripBasicMarkdown(reasoningLeak.response),
      },
    ]
  }

  const asJson = tryFormatJson(trimmed)
  if (asJson) {
    return [{ kind: "json", content: asJson }]
  }

  const trailingLabeledJsonMatch =
    /^(?<prefix>[\s\S]*?)\n(?<label>[A-Za-z][A-Za-z0-9 _-]{1,32}):\n(?<json>\{[\s\S]*\})$/u.exec(
      trimmed
    )

  if (trailingLabeledJsonMatch?.groups) {
    const formatted = tryFormatJson(trailingLabeledJsonMatch.groups.json)
    if (formatted) {
      const blocks: MessageBlock[] = []
      const prefix = trailingLabeledJsonMatch.groups.prefix.trim()
      if (prefix.length > 0) {
        blocks.push({ kind: "text", content: prefix })
      }
      blocks.push({
        kind: "json",
        label: trailingLabeledJsonMatch.groups.label.trim(),
        content: formatted,
      })
      return blocks
    }
  }

  return [{ kind: "text", content: trimmed }]
}

const toMessageBlocks = (message: ChatMessage): MessageBlock[] => {
  const source = message.text.trim()
  if (source.length === 0) {
    return []
  }

  const lines = source.split(/\r?\n/u)
  const blocks: MessageBlock[] = []
  const textBuffer: string[] = []

  const flushTextBuffer = () => {
    const joined = textBuffer.join("\n").trim()
    textBuffer.length = 0

    if (joined.length > 0) {
      blocks.push(...splitTextIntoRichBlocks(joined, message.role))
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("Reasoning: ")) {
      flushTextBuffer()
      const content = trimmed.slice("Reasoning: ".length).trim()
      if (content.length > 0) {
        blocks.push({ kind: "reasoning", content: stripBasicMarkdown(content) })
      }
      continue
    }

    if (trimmed.startsWith("Tool ")) {
      flushTextBuffer()
      const content = trimmed.slice("Tool ".length).trim()
      if (content.length > 0) {
        blocks.push({ kind: "tool", content })
      }
      continue
    }

    textBuffer.push(line)
  }

  flushTextBuffer()
  return blocks
}

const renderMessageBlock = (block: MessageBlock, key: string) => {
  if (block.kind === "reasoning") {
    return (
      <div
        key={key}
        className="rounded-md border border-[rgba(23,92,211,0.25)] bg-[rgba(230,241,255,0.8)] px-2.5 py-2"
      >
        <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#2456a8] uppercase">
          {block.label ?? "Reasoning"}
        </p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-[#173664]">{block.content}</p>
      </div>
    )
  }

  if (block.kind === "tool") {
    return (
      <div
        key={key}
        className="rounded-md border border-[rgba(76,65,184,0.25)] bg-[rgba(239,235,255,0.7)] px-2.5 py-2"
      >
        <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#4b3d9f] uppercase">Tool</p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-[#332767]">{block.content}</p>
      </div>
    )
  }

  if (block.kind === "json") {
    const lineCount = block.content.split(/\r?\n/u).length
    const heading = block.label ? `${block.label} JSON` : "JSON"

    if (lineCount > 24) {
      return (
        <details
          key={key}
          className="rounded-md border border-[rgba(26,26,26,0.14)] bg-[rgba(245,247,250,0.92)] px-2.5 py-2"
        >
          <summary className="cursor-pointer text-xs text-[#4e5661]">
            {heading} ({lineCount} lines)
          </summary>
          <pre className="m-0 mt-2 overflow-x-auto font-mono text-[12px] leading-relaxed text-[#1d2530]">
            {block.content}
          </pre>
        </details>
      )
    }

    return (
      <div
        key={key}
        className="rounded-md border border-[rgba(26,26,26,0.14)] bg-[rgba(245,247,250,0.92)] px-2.5 py-2"
      >
        {block.label ? (
          <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#4e5661] uppercase">
            {block.label}
          </p>
        ) : null}
        <pre className="m-0 overflow-x-auto font-mono text-[12px] leading-relaxed text-[#1d2530]">
          {block.content}
        </pre>
      </div>
    )
  }

  const trimmed = block.content.trim()

  if (trimmed.length > 700) {
    const preview = `${trimmed.slice(0, 220).trimEnd()}...`

    return (
      <details
        key={key}
        className="rounded-md border border-[rgba(26,26,26,0.12)] bg-[rgba(250,250,250,0.9)] px-2.5 py-2"
      >
        <summary className="cursor-pointer text-sm text-[#3b3b3b]">{preview}</summary>
        <pre className="m-0 mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[#1f1f1f]">
          {block.content}
        </pre>
      </details>
    )
  }

  return (
    <div key={key} className="space-y-2">
      {block.content
        .split(/\n{2,}/u)
        .map((paragraph) => stripBasicMarkdown(paragraph.trim()))
        .filter((paragraph) => paragraph.length > 0)
        .map((paragraph, index) => (
          <p
            key={`${key}-p-${index}`}
            className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-[#1f1f1f]"
          >
            {paragraph}
          </p>
        ))}
    </div>
  )
}

const summarizeBlocks = (blocks: MessageBlock[]): string => {
  for (const block of blocks) {
    const content = block.content.trim()
    if (content.length === 0) {
      continue
    }

    if (block.kind === "json") {
      return block.label ? `${block.label} JSON` : "JSON payload"
    }

    const singleLine = content.replace(/\s+/gu, " ")
    if (singleLine.length <= 120) {
      return singleLine
    }

    return `${singleLine.slice(0, 120).trimEnd()}...`
  }

  return "Message"
}

export default function ChatRoute() {
  const data = useLoaderData<typeof loader>()
  const messagesViewportRef = useRef<HTMLDivElement | null>(null)
  const shouldAutoScrollRef = useRef(true)

  const [threadsPayload, setThreadsPayload] = useState<ChatThreadsResponse>(data.payload)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messagesDegraded, setMessagesDegraded] = useState(false)
  const [messagesStatusMessage, setMessagesStatusMessage] = useState<string | null>(null)
  const [isRefreshingThreads, setIsRefreshingThreads] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showNonInteractiveThreads, setShowNonInteractiveThreads] = useState(false)
  const [composerDrafts, setComposerDrafts] = useState<Record<string, string>>({
    [NEW_DRAFT_KEY]: "",
  })
  const [showTraceEvents, setShowTraceEvents] = useState(false)
  const [isThreadsDrawerOpen, setIsThreadsDrawerOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [messageLoadError, setMessageLoadError] = useState<string | null>(
    data.status === "error" ? data.message : null
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)")
    const update = () => {
      setIsMobileViewport(mediaQuery.matches)
    }

    update()
    mediaQuery.addEventListener("change", update)

    return () => {
      mediaQuery.removeEventListener("change", update)
    }
  }, [])

  useEffect(() => {
    if (!isMobileViewport) {
      setKeyboardInset(0)
      return
    }

    if (typeof window === "undefined" || !window.visualViewport) {
      return
    }

    const viewport = window.visualViewport

    const update = () => {
      const inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
      setKeyboardInset(Math.round(inset))
    }

    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)

    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [isMobileViewport])

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) {
      return null
    }

    return threadsPayload.threads.find((thread) => thread.id === selectedThreadId) ?? null
  }, [selectedThreadId, threadsPayload.threads])

  const activeDraftKey = selectedThreadId ?? NEW_DRAFT_KEY
  const composerText = composerDrafts[activeDraftKey] ?? ""
  const hasUnsentDraft = composerText.trim().length > 0
  const visibleThreads = useMemo(() => {
    if (showNonInteractiveThreads) {
      return threadsPayload.threads
    }

    return threadsPayload.threads.filter((thread) => isInteractiveLaneThread(thread))
  }, [showNonInteractiveThreads, threadsPayload.threads])
  const hiddenNonInteractiveCount = threadsPayload.threads.length - visibleThreads.length

  useEffect(() => {
    if (showNonInteractiveThreads || !selectedThreadId) {
      return
    }

    const selected = threadsPayload.threads.find((thread) => thread.id === selectedThreadId)
    if (selected && !isInteractiveLaneThread(selected)) {
      setSelectedThreadId(null)
    }
  }, [selectedThreadId, showNonInteractiveThreads, threadsPayload.threads])

  useEffect(() => {
    if (!isMobileViewport) {
      return
    }

    setIsThreadsDrawerOpen(false)
  }, [isMobileViewport, selectedThreadId])

  const messagePresentation = useMemo(() => {
    const allItems = messages.map((message) => {
      const blocks = toMessageBlocks(message)
      const hasTraceParts =
        message.partTypes.includes("reasoning") || message.partTypes.includes("tool")
      const hasTextBlock = blocks.some((block) => block.kind === "text")
      const isTraceOnly = hasTraceParts && !hasTextBlock

      return {
        message,
        blocks,
        isTraceOnly,
      }
    })

    const traceOnlyCount = allItems.filter((entry) => entry.isTraceOnly).length
    const items = allItems.filter((entry) => showTraceEvents || !entry.isTraceOnly)

    return {
      items,
      traceOnlyCount,
      hiddenTraceCount: showTraceEvents ? 0 : traceOnlyCount,
    }
  }, [messages, showTraceEvents])

  const scrollMessagesToBottom = () => {
    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    shouldAutoScrollRef.current = distanceToBottom < 120
  }

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([])
      setMessageLoadError(null)
      setShowTraceEvents(false)
      shouldAutoScrollRef.current = true
      return
    }

    setShowTraceEvents(false)
    shouldAutoScrollRef.current = true

    let disposed = false
    const run = async () => {
      setIsLoadingMessages(true)
      setMessageLoadError(null)

      try {
        const payload = await fetchMessages(selectedThreadId)
        if (disposed) {
          return
        }

        setMessages(payload.messages)
        setMessagesDegraded(payload.degraded)
        setMessagesStatusMessage(payload.message ?? null)
      } catch (error) {
        if (disposed) {
          return
        }

        setMessageLoadError(error instanceof Error ? error.message : "Could not load chat messages")
      } finally {
        if (!disposed) {
          setIsLoadingMessages(false)
        }
      }
    }

    void run()

    return () => {
      disposed = true
    }
  }, [selectedThreadId])

  useEffect(() => {
    if (isLoadingMessages || !shouldAutoScrollRef.current) {
      return
    }

    const raf = window.requestAnimationFrame(() => {
      scrollMessagesToBottom()
    })

    return () => {
      window.cancelAnimationFrame(raf)
    }
  }, [
    isLoadingMessages,
    messagePresentation.items.length,
    messagePresentation.items.at(-1)?.message.text,
  ])

  const refreshThreads = async () => {
    setIsRefreshingThreads(true)
    try {
      const payload = await fetchThreads()
      setThreadsPayload(payload)

      if (selectedThreadId && !payload.threads.some((thread) => thread.id === selectedThreadId)) {
        setSelectedThreadId(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh threads")
    } finally {
      setIsRefreshingThreads(false)
    }
  }

  const handleStartNewChat = () => {
    setSelectedThreadId(null)
    setComposerDrafts((current) => ({
      ...current,
      [NEW_DRAFT_KEY]: "",
    }))
    setMessages([])
    setMessageLoadError(null)
    setMessagesStatusMessage(null)
    setShowTraceEvents(false)
    shouldAutoScrollRef.current = true
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSending) {
      return
    }

    const text = composerText.trim()
    if (text.length === 0) {
      return
    }

    setIsSending(true)
    setMessageLoadError(null)
    shouldAutoScrollRef.current = true

    try {
      let targetThreadId = selectedThreadId
      if (!targetThreadId) {
        const created = await createThread()
        targetThreadId = created.id

        setThreadsPayload((current) => ({
          ...current,
          threads: [created, ...current.threads.filter((thread) => thread.id !== created.id)],
        }))
        setSelectedThreadId(created.id)
      }

      const optimisticUserMessageId = `local-user-${Date.now()}`
      const optimisticAssistantMessageId = `local-assistant-${Date.now()}`
      let streamedAssistantMessageId = optimisticAssistantMessageId

      setMessages((current) => [
        ...current,
        {
          id: optimisticUserMessageId,
          role: "user",
          text,
          createdAt: Date.now(),
          partTypes: ["text"],
        },
        {
          id: optimisticAssistantMessageId,
          role: "assistant",
          text: "Thinking...",
          createdAt: Date.now() + 1,
          partTypes: ["text"],
        },
      ])

      setComposerDrafts((current) => ({
        ...current,
        [targetThreadId]: "",
        [NEW_DRAFT_KEY]: targetThreadId === selectedThreadId ? (current[NEW_DRAFT_KEY] ?? "") : "",
      }))

      await streamMessage(targetThreadId, text, (event) => {
        if (event.type === "started") {
          streamedAssistantMessageId = event.messageId
          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticAssistantMessageId
                ? {
                    ...message,
                    id: event.messageId,
                    createdAt: event.createdAt,
                  }
                : message
            )
          )
          return
        }

        if (event.type === "delta") {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamedAssistantMessageId || message.id === event.messageId
                ? {
                    ...message,
                    text: event.text.length > 0 ? event.text : "Thinking...",
                    partTypes: event.partTypes,
                  }
                : message
            )
          )
          return
        }

        if (event.type === "completed") {
          const reply = event.reply
          if (!reply) {
            setMessages((current) =>
              current.filter(
                (message) =>
                  message.id !== optimisticAssistantMessageId &&
                  message.id !== streamedAssistantMessageId
              )
            )
            return
          }

          setMessages((current) =>
            current.map((message) =>
              message.id === optimisticAssistantMessageId ||
              message.id === streamedAssistantMessageId ||
              message.id === reply.id
                ? reply
                : message
            )
          )
          return
        }

        setMessageLoadError(event.message)
      })

      const refreshed = await fetchMessages(targetThreadId)
      setMessages(refreshed.messages)
      setMessagesDegraded(refreshed.degraded)
      setMessagesStatusMessage(refreshed.message ?? null)
      setShowTraceEvents(false)

      setThreadsPayload((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === targetThreadId
            ? {
                ...thread,
                updatedAt: Date.now(),
                isStale: false,
              }
            : thread
        ),
      }))
    } catch (error) {
      setMessageLoadError(error instanceof Error ? error.message : "Could not send message")
    } finally {
      setIsSending(false)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return
    }

    if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
      return
    }

    if (event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const handleThreadSelect = (threadId: string) => {
    setSelectedThreadId(threadId)
    if (isMobileViewport) {
      setIsThreadsDrawerOpen(false)
    }
  }

  const handleComposerChange = (value: string) => {
    const draftKey = selectedThreadId ?? NEW_DRAFT_KEY
    setComposerDrafts((current) => ({
      ...current,
      [draftKey]: value,
    }))
  }

  const handleDiscardDraft = () => {
    const draftKey = selectedThreadId ?? NEW_DRAFT_KEY
    setComposerDrafts((current) => ({
      ...current,
      [draftKey]: "",
    }))
  }

  const threadsListContent =
    visibleThreads.length === 0 ? (
      hiddenNonInteractiveCount > 0 ? (
        <p className="m-0 text-sm text-[#777777]">
          No interactive threads right now. Turn on "Show non-interactive" to inspect job/system
          sessions.
        </p>
      ) : (
        <p className="m-0 text-sm text-[#888888]">No threads yet. Create one to start chatting.</p>
      )
    ) : (
      <>
        {hiddenNonInteractiveCount > 0 ? (
          <p className="m-0 text-xs text-[#7a7a7a]">
            {hiddenNonInteractiveCount} non-interactive thread
            {hiddenNonInteractiveCount === 1 ? "" : "s"} hidden.
          </p>
        ) : null}
        {visibleThreads.map((thread) => {
          const isActive = thread.id === selectedThreadId

          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => handleThreadSelect(thread.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                isActive
                  ? "border-[rgba(26,26,26,0.2)] bg-[rgba(26,26,26,0.06)]"
                  : "border-[rgba(26,26,26,0.1)] bg-white hover:bg-[rgba(26,26,26,0.03)]"
              }`}
            >
              <p className="m-0 truncate text-sm font-medium text-[#1a1a1a]">{thread.title}</p>
              <p className="m-0 mt-1 font-mono text-[10px] tracking-[0.08em] text-[#888888] uppercase">
                {thread.isBound ? "Bound" : "Unbound"}
                {thread.isStale ? " • Stale" : ""}
              </p>
              <p className="m-0 mt-1 text-xs text-[#777777]">
                Updated {formatDateTime(thread.updatedAt)}
              </p>
            </button>
          )
        })}
      </>
    )

  const threadFilterDescription = showNonInteractiveThreads
    ? "Includes job and system threads"
    : hiddenNonInteractiveCount > 0
      ? `${hiddenNonInteractiveCount} hidden`
      : "Interactive threads only"

  const composerMobileStyle = isMobileViewport
    ? {
        transform: `translateY(-${keyboardInset}px)`,
        marginBottom: "calc(env(safe-area-inset-bottom) + 2px)",
      }
    : undefined

  return (
    <section className="flex h-full min-h-0 w-full max-w-none flex-col px-0 pb-1">
      <header className="mb-2.5 flex items-end justify-between gap-3 max-[720px]:mb-2 max-[720px]:flex-col max-[720px]:items-start max-[720px]:gap-2">
        <div>
          <p className="mb-1.5 font-mono text-[11px] tracking-[0.2em] text-[#888888] uppercase">
            Chat
          </p>
          <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-[1.8rem] max-[720px]:leading-[1.02]">
            Operator Chat Surface
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={handleStartNewChat}>
            New
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshThreads()}
            disabled={isRefreshingThreads}
            className="max-[720px]:hidden"
          >
            {isRefreshingThreads ? "Refreshing" : "Refresh"}
          </Button>
          <Link to="/" className="inline-flex">
            <Button variant="outline" size="sm">
              Home
            </Button>
          </Link>
        </div>
      </header>

      {threadsPayload.degraded || messagesDegraded || data.status === "error" ? (
        <Card className="mb-3 border-[rgba(235,59,59,0.35)] bg-[rgba(255,247,247,0.9)]">
          <CardHeader>
            <CardTitle className="text-[#9f2424]">Degraded Chat Window</CardTitle>
            <CardDescription>OpenCode or session state is partially unavailable</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[0.95rem] text-[#581c1c]">
              {messageLoadError ??
                messagesStatusMessage ??
                threadsPayload.message ??
                "Chat is available with limited data. Retry to reconnect."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div
        className={`fixed inset-0 z-50 md:hidden ${
          isThreadsDrawerOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isThreadsDrawerOpen}
      >
        <button
          type="button"
          aria-label="Close threads panel"
          className={`absolute inset-0 bg-[rgba(20,20,20,0.36)] transition-opacity ${
            isThreadsDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsThreadsDrawerOpen(false)}
        />
        <aside
          className={`relative flex h-full w-[86%] max-w-[320px] flex-col border-r border-[rgba(26,26,26,0.12)] bg-[rgba(250,250,250,0.96)] shadow-2xl backdrop-blur transition-transform duration-200 ${
            isThreadsDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-[rgba(26,26,26,0.1)] px-3 py-3">
            <div>
              <p className="m-0 font-mono text-[10px] tracking-[0.1em] text-[#7b7b7b] uppercase">
                Chat Sessions
              </p>
              <p className="m-0 mt-0.5 text-lg font-medium text-[#1a1a1a]">Threads</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-3"
              onClick={() => setIsThreadsDrawerOpen(false)}
            >
              Close
            </Button>
          </div>
          <div className="border-b border-[rgba(26,26,26,0.08)] px-3 py-2.5">
            <Switch
              checked={showNonInteractiveThreads}
              onCheckedChange={setShowNonInteractiveThreads}
              label="Show non-interactive"
              description={threadFilterDescription}
              size="compact"
              className="w-full"
            />
          </div>
          <div className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {threadsListContent}
          </div>
        </aside>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[320px_minmax(0,1fr)] md:gap-4">
        <Card className="hidden h-full min-h-0 flex-col overflow-hidden md:flex">
          <CardHeader className="space-y-2">
            <CardDescription>Bound and discovered sessions</CardDescription>
            <CardTitle>Threads</CardTitle>
            <Switch
              checked={showNonInteractiveThreads}
              onCheckedChange={setShowNonInteractiveThreads}
              label="Show non-interactive"
              description={threadFilterDescription}
              size="compact"
              className="w-full"
            />
          </CardHeader>
          <CardContent className="hide-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
            {threadsListContent}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardDescription>
                {selectedThread ? selectedThread.id : "Draft session (creates on first send)"}
              </CardDescription>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>{selectedThread ? selectedThread.title : "New chat"}</span>
                {hasUnsentDraft ? (
                  <span className="rounded-full border border-[rgba(185,91,0,0.35)] bg-[rgba(255,245,230,0.9)] px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-[#9a5600] uppercase">
                    Draft unsent
                  </span>
                ) : null}
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsThreadsDrawerOpen(true)}
              className="h-10 px-3 md:hidden"
            >
              Threads
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pb-3">
            <>
              <div
                ref={messagesViewportRef}
                onScroll={handleMessagesScroll}
                className="hide-scrollbar mb-2 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.75)] p-2.5 md:mb-3 md:p-3"
              >
                {selectedThread && messagePresentation.traceOnlyCount > 0 ? (
                  <div className="mb-2 flex items-center justify-between rounded-md border border-[rgba(26,26,26,0.12)] bg-[rgba(248,248,248,0.9)] px-2.5 py-2">
                    <p className="m-0 text-xs text-[#666666]">
                      {showTraceEvents
                        ? `Showing ${messagePresentation.traceOnlyCount} execution trace events`
                        : `${messagePresentation.hiddenTraceCount} execution trace events hidden`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowTraceEvents((current) => !current)}
                      className="font-mono text-[10px] tracking-[0.08em] text-[#1a1a1a] uppercase"
                    >
                      {showTraceEvents ? "Hide trace" : "Show trace"}
                    </button>
                  </div>
                ) : null}

                {isLoadingMessages ? (
                  <p className="m-0 flex min-h-full items-center justify-center text-sm text-[#888888]">
                    Loading messages...
                  </p>
                ) : messageLoadError ? (
                  <p className="m-0 flex min-h-full items-center justify-center text-center text-sm text-[#b42318]">
                    {messageLoadError}
                  </p>
                ) : !selectedThread ? (
                  <p className="m-0 flex min-h-full items-center justify-center text-center text-sm text-[#777777]">
                    New chat started. Your first message will create and bind a session.
                  </p>
                ) : messagePresentation.items.length === 0 ? (
                  <p className="m-0 flex min-h-full items-center justify-center text-center text-sm text-[#888888]">
                    No messages yet in this thread.
                  </p>
                ) : (
                  messagePresentation.items.map(({ message, blocks }) => {
                    const traceBlocks = blocks.filter(
                      (block) => block.kind === "reasoning" || block.kind === "tool"
                    )
                    const responseBlocks = blocks.filter(
                      (block) => block.kind !== "reasoning" && block.kind !== "tool"
                    )
                    const hasResponseBlocks = responseBlocks.length > 0
                    const isAssistant = message.role === "assistant"
                    const isUser = message.role === "user"
                    const responseCharacterCount = responseBlocks.reduce(
                      (total, block) => total + block.content.length,
                      0
                    )
                    const shouldCollapseUser = isUser && responseCharacterCount > 520
                    const userSummary = summarizeBlocks(responseBlocks)

                    return (
                      <article
                        key={message.id}
                        className={`rounded-xl border px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.04)] ${resolveMessageTone(message.role)}`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <p className="m-0 font-mono text-[10px] tracking-[0.1em] text-[#666666] uppercase">
                            {message.role}
                          </p>
                          <p className="m-0 text-[11px] text-[#787878]">
                            {formatDateTime(message.createdAt)}
                          </p>
                        </div>

                        {blocks.length === 0 ? (
                          <p className="m-0 text-sm text-[#666666]">[non-text response]</p>
                        ) : isAssistant ? (
                          <div className="space-y-2">
                            {hasResponseBlocks ? (
                              <div className="rounded-md border border-[rgba(20,114,70,0.24)] bg-[rgba(242,252,247,0.85)] px-2.5 py-2">
                                <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#1f7a4f] uppercase">
                                  Response
                                </p>
                                <div className="mt-1.5 space-y-2">
                                  {responseBlocks.map((block, index) =>
                                    renderMessageBlock(block, `${message.id}-response-${index}`)
                                  )}
                                </div>
                              </div>
                            ) : null}

                            {traceBlocks.length > 0 ? (
                              <details className="rounded-md border border-[rgba(76,65,184,0.24)] bg-[rgba(244,241,255,0.78)] px-2.5 py-2">
                                <summary className="cursor-pointer text-xs text-[#4b3d9f]">
                                  Thinking and tools ({traceBlocks.length})
                                </summary>
                                <div className="mt-2 space-y-2">
                                  {traceBlocks.map((block, index) =>
                                    renderMessageBlock(block, `${message.id}-trace-${index}`)
                                  )}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : shouldCollapseUser ? (
                          <details className="rounded-md border border-[rgba(26,26,26,0.14)] bg-[rgba(250,250,250,0.9)] px-2.5 py-2">
                            <summary className="cursor-pointer text-sm text-[#3a3a3a]">
                              {userSummary}
                            </summary>
                            <div className="mt-2 space-y-2">
                              {responseBlocks.map((block, index) =>
                                renderMessageBlock(block, `${message.id}-user-${index}`)
                              )}
                            </div>
                          </details>
                        ) : (
                          <div className="space-y-2">
                            {responseBlocks.map((block, index) =>
                              renderMessageBlock(block, `${message.id}-${index}`)
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })
                )}
              </div>

              <form
                onSubmit={handleSubmit}
                className="grid gap-2 rounded-lg border border-[rgba(26,26,26,0.1)] bg-[rgba(255,255,255,0.94)] p-2.5 shadow-sm transition-transform duration-150"
                style={composerMobileStyle}
              >
                <textarea
                  id="chat-composer"
                  value={composerText}
                  onChange={(event) => handleComposerChange(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Write a message to Otto..."
                  rows={isMobileViewport ? 2 : 4}
                  className="max-h-[45dvh] min-h-[86px] rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a] md:min-h-[120px]"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 text-[11px] text-[#7a7a7a] md:text-xs">
                    Enter to send, Shift+Enter for newline.
                  </p>
                  <div className="flex items-center gap-2">
                    {hasUnsentDraft ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-3"
                        onClick={handleDiscardDraft}
                      >
                        Discard
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      disabled={isSending || !hasUnsentDraft}
                      className="h-10 px-4"
                    >
                      {isSending ? "Sending..." : "Send"}
                    </Button>
                  </div>
                </div>
              </form>
            </>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
