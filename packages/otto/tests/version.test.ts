import { describe, expect, it } from "vitest"

import { APP_VERSION, getAppVersion } from "../src/version.js"

describe("getAppVersion", () => {
  it("returns the embedded build version", () => {
    // Arrange
    const expectedVersion = APP_VERSION

    // Act
    const actualVersion = getAppVersion()

    // Assert
    expect(actualVersion).toBe(expectedVersion)
  })
})
