import { describe, expect, it } from "vitest"

import {
  createApiModelsDefaultsAction,
  createApiModelsDefaultsLoader,
} from "../../app/server/api-models-defaults-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

const defaults = {
  flowDefaults: {
    interactiveAssistant: "openai/gpt-5.3-codex",
    scheduledTasks: null,
    heartbeat: null,
    watchdogFailures: null,
  },
}

describe("api.models.defaults loader", () => {
  it("returns flow defaults", async () => {
    // Arrange
    const loader = createApiModelsDefaultsLoader({
      loadDefaults: async () => defaults,
      updateDefaults: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(defaults)
  })

  it("maps upstream failures", async () => {
    // Arrange
    const loader = createApiModelsDefaultsLoader({
      loadDefaults: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
      updateDefaults: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: "runtime_unavailable" })
  })
})

describe("api.models.defaults action", () => {
  it("updates flow defaults via PUT", async () => {
    // Arrange
    const action = createApiModelsDefaultsAction({
      loadDefaults: async () => {
        throw new Error("unused in action test")
      },
      updateDefaults: async (input) => {
        expect(input.flowDefaults.scheduledTasks).toBe("anthropic/claude-sonnet-4")
        return input
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/defaults", {
        method: "PUT",
        body: JSON.stringify({
          flowDefaults: {
            interactiveAssistant: "openai/gpt-5.3-codex",
            scheduledTasks: "anthropic/claude-sonnet-4",
            heartbeat: null,
            watchdogFailures: null,
          },
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      flowDefaults: {
        scheduledTasks: "anthropic/claude-sonnet-4",
      },
    })
  })

  it("rejects non-put methods", async () => {
    // Arrange
    const action = createApiModelsDefaultsAction({
      loadDefaults: async () => {
        throw new Error("unused in action test")
      },
      updateDefaults: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/defaults", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })

  it("rejects invalid payload", async () => {
    // Arrange
    const action = createApiModelsDefaultsAction({
      loadDefaults: async () => {
        throw new Error("unused in action test")
      },
      updateDefaults: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/defaults", {
        method: "PUT",
        body: JSON.stringify({
          flowDefaults: {
            interactiveAssistant: "invalid",
            scheduledTasks: null,
            heartbeat: null,
            watchdogFailures: null,
          },
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "invalid_request" })
  })
})
