import { describe, expect, it } from "vitest"

import {
  createApiPromptsFileAction,
  createApiPromptsFileLoader,
} from "../../app/server/api-prompts-file-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.prompts.file loader", () => {
  it("reads one prompt file", async () => {
    // Arrange
    const loader = createApiPromptsFileLoader({
      readPromptFile: async (source, relativePath) => {
        expect(source).toBe("user")
        expect(relativePath).toBe("layers/media-web.md")
        return {
          file: {
            source,
            relativePath,
            editable: true,
            content: "# Prompt",
          },
        }
      },
      updatePromptFile: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader({
      request: new Request(
        "http://localhost/api/prompts/file?source=user&path=layers/media-web.md"
      ),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      file: {
        source: "user",
        relativePath: "layers/media-web.md",
      },
    })
  })

  it("rejects missing query params", async () => {
    // Arrange
    const loader = createApiPromptsFileLoader({
      readPromptFile: async () => {
        throw new Error("unused")
      },
      updatePromptFile: async () => {
        throw new Error("unused")
      },
    })

    // Act
    const response = await loader({
      request: new Request("http://localhost/api/prompts/file"),
    })

    // Assert
    expect(response.status).toBe(400)
  })

  it("returns 400 for invalid source query values", async () => {
    // Arrange
    const loader = createApiPromptsFileLoader({
      readPromptFile: async () => {
        throw new Error("unused")
      },
      updatePromptFile: async () => {
        throw new Error("unused")
      },
    })

    // Act
    const response = await loader({
      request: new Request("http://localhost/api/prompts/file?source=foo&path=layers/media-web.md"),
    })

    // Assert
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: "invalid_request",
    })
  })
})

describe("api.prompts.file action", () => {
  it("updates a user prompt file", async () => {
    // Arrange
    const action = createApiPromptsFileAction({
      readPromptFile: async () => {
        throw new Error("unused in action test")
      },
      updatePromptFile: async (input) => {
        expect(input).toEqual({
          source: "user",
          relativePath: "layers/media-web.md",
          content: "# Updated",
        })

        return {
          status: "updated",
          file: {
            source: "user",
            relativePath: "layers/media-web.md",
            editable: true,
            updatedAt: 1_700_000_000_000,
          },
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/prompts/file", {
        method: "PUT",
        body: JSON.stringify({
          source: "user",
          relativePath: "layers/media-web.md",
          content: "# Updated",
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: "updated",
    })
  })

  it("maps forbidden system write attempts", async () => {
    // Arrange
    const action = createApiPromptsFileAction({
      readPromptFile: async () => {
        throw new Error("unused in action test")
      },
      updatePromptFile: async () => {
        throw new OttoExternalApiError("forbidden", 403)
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/prompts/file", {
        method: "PUT",
        body: JSON.stringify({
          source: "system",
          relativePath: "layers/core-persona.md",
          content: "# Nope",
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: "forbidden_mutation",
    })
  })
})
