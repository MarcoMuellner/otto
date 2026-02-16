import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import {
  evaluateTelegramAccess,
  extractTelegramAccessContext,
  logDeniedTelegramAccess,
} from "../../src/telegram-worker/security.js"

describe("extractTelegramAccessContext", () => {
  it("extracts user, chat, and chat type from message update", () => {
    // Arrange
    const update = {
      message: {
        from: { id: 1001 },
        chat: { id: 2002, type: "private" },
      },
    }

    // Act
    const context = extractTelegramAccessContext(update)

    // Assert
    expect(context).toEqual({
      userId: 1001,
      chatId: 2002,
      chatType: "private",
    })
  })
})

describe("evaluateTelegramAccess", () => {
  it("allows matching private user and chat", () => {
    // Arrange
    const context = {
      userId: 1001,
      chatId: 2002,
      chatType: "private",
    }

    // Act
    const decision = evaluateTelegramAccess(context, {
      allowedUserId: 1001,
      allowedChatId: 2002,
    })

    // Assert
    expect(decision).toEqual({ allowed: true, reason: "authorized" })
  })

  it("denies non-private chats", () => {
    // Arrange
    const context = {
      userId: 1001,
      chatId: 2002,
      chatType: "group",
    }

    // Act
    const decision = evaluateTelegramAccess(context, {
      allowedUserId: 1001,
      allowedChatId: 2002,
    })

    // Assert
    expect(decision).toEqual({ allowed: false, reason: "non_private_chat" })
  })

  it("denies mismatched user ids", () => {
    // Arrange
    const context = {
      userId: 9999,
      chatId: 2002,
      chatType: "private",
    }

    // Act
    const decision = evaluateTelegramAccess(context, {
      allowedUserId: 1001,
      allowedChatId: 2002,
    })

    // Assert
    expect(decision).toEqual({ allowed: false, reason: "user_not_allowed" })
  })
})

describe("logDeniedTelegramAccess", () => {
  it("emits audit logs for denied decisions", () => {
    // Arrange
    const warn = vi.fn()
    const logger = {
      warn,
    } as unknown as Logger
    const decision = { allowed: false as const, reason: "chat_not_allowed" as const }
    const context = {
      userId: 1001,
      chatId: 2222,
      chatType: "private",
    }

    // Act
    logDeniedTelegramAccess(logger, decision, context)

    // Assert
    expect(warn).toHaveBeenCalledWith(
      {
        reason: "chat_not_allowed",
        userId: 1001,
        chatId: 2222,
        chatType: "private",
      },
      "Telegram update denied by security gate"
    )
  })
})
