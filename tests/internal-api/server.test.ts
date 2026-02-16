import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { buildInternalApiServer, resolveInternalApiConfig } from "../../src/internal-api/server.js"
import type { OutboundMessageEnqueueRepository } from "../../src/telegram-worker/outbound-enqueue.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-internal-api-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createLoggerStub = (): Logger => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger
}

describe("resolveInternalApiConfig", () => {
  it("creates and reuses a persisted token file", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    // Act
    const first = await resolveInternalApiConfig(homeDirectory, {})
    const second = await resolveInternalApiConfig(homeDirectory, {})

    // Assert
    expect(first.token).toBe(second.token)
    const persisted = await readFile(first.tokenPath, "utf8")
    expect(persisted.trim()).toBe(first.token)
  })
})

describe("buildInternalApiServer", () => {
  it("returns unauthorized when token is missing", async () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-message",
      payload: { chatId: 7, content: "hello" },
    })

    // Assert
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it("queues message when authorized", async () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-message",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        chatId: 9,
        content: "hello",
        dedupeKey: "dedupe-1",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "enqueued",
      queuedCount: 1,
      duplicateCount: 0,
      dedupeKey: "dedupe-1",
    })
    expect(repository.enqueueOrIgnoreDedupe).toHaveBeenCalledOnce()

    await app.close()
  })
})
