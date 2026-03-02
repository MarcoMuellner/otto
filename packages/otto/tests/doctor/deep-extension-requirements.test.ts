import { describe, expect, it } from "vitest"

import type { ExtensionManifest } from "otto-extension-sdk"

import { createDeepExtensionRequirementsCheck } from "../../src/doctor/checks/deep/extension-requirements.js"

const createManifest = (input: {
  id?: string
  version?: string
  env?: string[]
  files?: string[]
  binaries?: string[]
}): ExtensionManifest => {
  return {
    schemaVersion: 1,
    id: input.id ?? "google-calendar",
    name: "Google Calendar MCP",
    version: input.version ?? "0.1.0",
    description: "test manifest",
    tags: [],
    payload: {
      mcp: {
        file: "mcp.jsonc",
      },
    },
    requirements: {
      env: input.env ?? [],
      files: input.files ?? [],
      binaries: input.binaries ?? [],
    },
    dependencies: [],
  }
}

describe("deep extension requirements check", () => {
  it("returns ok when all requirements are present", async () => {
    // Arrange
    const check = createDeepExtensionRequirementsCheck({
      environment: {
        OTTO_HOME: "/tmp/.otto",
        GOOGLE_CLIENT_ID: "client-id",
      },
      listEnabledExtensions: async () => [
        {
          id: "google-calendar",
          activeVersion: "0.1.0",
        },
      ],
      loadManifest: async () =>
        createManifest({
          env: ["GOOGLE_CLIENT_ID"],
          files: ["secrets/gcp-oauth.keys.json"],
          binaries: ["npx"],
        }),
      pathExists: async () => true,
      hasBinary: async () => true,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(result.evidence[0]).toMatchObject({
      code: "DEEP_EXTENSION_REQUIREMENTS_OK",
    })
  })

  it("returns error when required env variables are missing", async () => {
    // Arrange
    const check = createDeepExtensionRequirementsCheck({
      environment: {
        OTTO_HOME: "/tmp/.otto",
      },
      listEnabledExtensions: async () => [
        {
          id: "anylist",
          activeVersion: "0.1.0",
        },
      ],
      loadManifest: async () =>
        createManifest({
          id: "anylist",
          env: ["ANYLIST_EMAIL", "ANYLIST_PASSWORD"],
        }),
      pathExists: async () => true,
      hasBinary: async () => true,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("error")
    expect(
      result.evidence.some((entry) => entry.code === "EXTENSION_REQUIREMENT_ENV_MISSING")
    ).toBe(true)
  })

  it("returns error when required files are missing", async () => {
    // Arrange
    const check = createDeepExtensionRequirementsCheck({
      environment: {
        OTTO_HOME: "/tmp/.otto",
      },
      listEnabledExtensions: async () => [
        {
          id: "google-calendar",
          activeVersion: "0.1.0",
        },
      ],
      loadManifest: async () =>
        createManifest({
          files: ["secrets/gcp-oauth.keys.json"],
        }),
      pathExists: async () => false,
      hasBinary: async () => true,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("error")
    expect(
      result.evidence.some((entry) => entry.code === "EXTENSION_REQUIREMENT_FILE_MISSING")
    ).toBe(true)
  })

  it("returns error when required binaries are missing", async () => {
    // Arrange
    const check = createDeepExtensionRequirementsCheck({
      environment: {
        OTTO_HOME: "/tmp/.otto",
      },
      listEnabledExtensions: async () => [
        {
          id: "onepassword",
          activeVersion: "0.1.0",
        },
      ],
      loadManifest: async () =>
        createManifest({
          id: "onepassword",
          binaries: ["op"],
        }),
      pathExists: async () => true,
      hasBinary: async () => false,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("error")
    expect(
      result.evidence.some((entry) => entry.code === "EXTENSION_REQUIREMENT_BINARY_MISSING")
    ).toBe(true)
  })
})
