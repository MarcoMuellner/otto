import { describe, expect, it } from "vitest"

import { createApiPromptsFilesLoader } from "../../app/server/api-prompts-files-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.prompts.files loader", () => {
  it("returns prompt inventory payload", async () => {
    // Arrange
    const loader = createApiPromptsFilesLoader({
      listPromptFiles: async () => {
        return {
          files: [
            {
              source: "user",
              relativePath: "layers/media-web.md",
              editable: true,
            },
          ],
        }
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      files: [
        {
          source: "user",
          relativePath: "layers/media-web.md",
          editable: true,
        },
      ],
    })
  })

  it("maps runtime failure", async () => {
    // Arrange
    const loader = createApiPromptsFilesLoader({
      listPromptFiles: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: "runtime_unavailable",
    })
  })
})
