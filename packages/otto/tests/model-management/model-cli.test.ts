import { createServer } from "node:http"

import { describe, expect, it } from "vitest"

import { runModelCliCommand } from "../../src/model-cli.js"

const testEnv = {
  OTTO_HOME: "/tmp/.otto",
  OTTO_EXTERNAL_API_URL: "http://127.0.0.1:4190",
  OTTO_EXTERNAL_API_TOKEN: "secret-token",
}

const createStreams = () => {
  const outputs: string[] = []
  const errors: string[] = []

  return {
    outputs,
    errors,
    streams: {
      stdout: {
        log: (value?: unknown) => outputs.push(String(value ?? "")),
      },
      stderr: {
        error: (value?: unknown) => errors.push(String(value ?? "")),
      },
    },
  }
}

const resolveUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

describe("runModelCliCommand", () => {
  it("lists model catalog with bearer authorization", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()
    const seenRequests: Array<{ url: string; method: string; authorization: string | null }> = []

    const fetchMock: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers)
      seenRequests.push({
        url: resolveUrl(input),
        method: init?.method ?? "GET",
        authorization: headers.get("authorization"),
      })

      return Response.json(
        {
          models: ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
          updatedAt: 1_000,
          source: "network",
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(["model", "list"], streams, testEnv, fetchMock)

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("model")
    expect(outputs).toContain("openai/gpt-5.3-codex")
    expect(seenRequests).toEqual([
      {
        url: "http://127.0.0.1:4190/external/models/catalog",
        method: "GET",
        authorization: "Bearer secret-token",
      },
    ])
  })

  it("refreshes model catalog", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    const fetchMock: typeof fetch = async () => {
      return Response.json(
        {
          status: "ok",
          updatedAt: 5_000,
          count: 3,
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(["model", "refresh"], streams, testEnv, fetchMock)

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("status\tok")
    expect(outputs).toContain("count\t3")
  })

  it("sets model defaults for a flow", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()
    const requests: Array<{ method: string; url: string; body: string | null }> = []

    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: resolveUrl(input),
        body: typeof init?.body === "string" ? init.body : null,
      })

      if (requests.length === 1) {
        return Response.json(
          {
            flowDefaults: {
              interactiveAssistant: null,
              scheduledTasks: "openai/gpt-5.3-codex",
              heartbeat: null,
              watchdogFailures: null,
            },
          },
          { status: 200 }
        )
      }

      return Response.json(
        {
          flowDefaults: {
            interactiveAssistant: "anthropic/claude-sonnet-4",
            scheduledTasks: "openai/gpt-5.3-codex",
            heartbeat: null,
            watchdogFailures: null,
          },
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(
      ["model", "defaults", "set", "interactiveAssistant", "anthropic/claude-sonnet-4"],
      streams,
      testEnv,
      fetchMock
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      method: "GET",
      url: "http://127.0.0.1:4190/external/models/defaults",
    })
    expect(requests[1]).toMatchObject({
      method: "PUT",
      url: "http://127.0.0.1:4190/external/models/defaults",
    })
    expect(requests[1]?.body).toContain("anthropic/claude-sonnet-4")
    expect(outputs).toContain("interactiveAssistant\tanthropic/claude-sonnet-4")
  })

  it("shows model defaults", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    const fetchMock: typeof fetch = async () => {
      return Response.json(
        {
          flowDefaults: {
            interactiveAssistant: "openai/gpt-5.3-codex",
            scheduledTasks: null,
            heartbeat: null,
            watchdogFailures: null,
          },
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(
      ["model", "defaults", "show"],
      streams,
      testEnv,
      fetchMock
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("interactiveAssistant\topenai/gpt-5.3-codex")
    expect(outputs).toContain("scheduledTasks\tinherit")
  })

  it("sets model defaults flow to inherit", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()
    const requests: Array<{ method: string; url: string; body: string | null }> = []

    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: resolveUrl(input),
        body: typeof init?.body === "string" ? init.body : null,
      })

      if (requests.length === 1) {
        return Response.json(
          {
            flowDefaults: {
              interactiveAssistant: "openai/gpt-5.3-codex",
              scheduledTasks: "openai/gpt-5.3-codex",
              heartbeat: null,
              watchdogFailures: null,
            },
          },
          { status: 200 }
        )
      }

      return Response.json(
        {
          flowDefaults: {
            interactiveAssistant: "openai/gpt-5.3-codex",
            scheduledTasks: null,
            heartbeat: null,
            watchdogFailures: null,
          },
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(
      ["model", "defaults", "set", "scheduledTasks", "inherit"],
      streams,
      testEnv,
      fetchMock
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(requests).toHaveLength(2)
    expect(requests[1]?.body).toContain('"scheduledTasks":null')
    expect(outputs).toContain("scheduledTasks\tinherit")
  })

  it("sets task model to inherit", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()
    const requests: Array<{ method: string; url: string; body: string | null }> = []

    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: resolveUrl(input),
        body: typeof init?.body === "string" ? init.body : null,
      })

      return Response.json(
        {
          id: "task-1",
          status: "updated",
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(
      ["task", "set-model", "task-1", "inherit"],
      streams,
      testEnv,
      fetchMock
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(requests).toEqual([
      {
        method: "PATCH",
        url: "http://127.0.0.1:4190/external/jobs/task-1",
        body: '{"modelRef":null}',
      },
    ])
    expect(outputs).toContain("modelRef\tinherit")
  })

  it("returns non-zero code for invalid defaults flow input", async () => {
    // Arrange
    const { errors, streams } = createStreams()

    // Act
    const code = await runModelCliCommand(
      ["model", "defaults", "set", "unknownFlow", "openai/gpt-5.3-codex"],
      streams,
      testEnv,
      fetch
    )

    // Assert
    expect(code).toBe(1)
    expect(errors[0]).toContain("interactiveAssistant")
  })

  it("normalizes explicit 0.0.0.0 API URL to loopback", async () => {
    // Arrange
    const { errors, streams } = createStreams()
    const seenUrls: string[] = []
    const environment = {
      ...testEnv,
      OTTO_EXTERNAL_API_URL: "http://0.0.0.0:4190",
    }

    const fetchMock: typeof fetch = async (input) => {
      seenUrls.push(resolveUrl(input))
      return Response.json(
        {
          models: ["openai/gpt-5.3-codex"],
          updatedAt: 1_000,
          source: "network",
        },
        { status: 200 }
      )
    }

    // Act
    const code = await runModelCliCommand(["model", "list"], streams, environment, fetchMock)

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(seenUrls[0]).toBe("http://127.0.0.1:4190/external/models/catalog")
  })

  it("prints actionable message when API is unreachable", async () => {
    // Arrange
    const { errors, streams } = createStreams()
    const fetchMock: typeof fetch = async () => {
      throw new TypeError("fetch failed")
    }

    // Act
    const code = await runModelCliCommand(["model", "list"], streams, testEnv, fetchMock)

    // Assert
    expect(code).toBe(1)
    expect(errors[0]).toContain("Cannot reach Otto external API")
    expect(errors[0]).toContain("http://127.0.0.1:4190")
  })

  it("falls back to node:http for bad-port fetch restrictions", async () => {
    // Arrange
    const { errors, streams } = createStreams()
    const server = createServer((request, response) => {
      if (request.url === "/external/models/catalog") {
        response.writeHead(200, { "content-type": "application/json" })
        response.end(
          JSON.stringify({
            models: ["openai/gpt-5.3-codex"],
            updatedAt: 1_000,
            source: "network",
          })
        )
        return
      }

      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: "not_found" }))
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(10080, "127.0.0.1", () => {
        server.off("error", reject)
        resolve()
      })
    })

    try {
      const environment = {
        ...testEnv,
        OTTO_EXTERNAL_API_URL: "http://127.0.0.1:10080",
      }

      // Act
      const code = await runModelCliCommand(["model", "list"], streams, environment, fetch)

      // Assert
      expect(code).toBe(0)
      expect(errors).toEqual([])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    }
  })
})
