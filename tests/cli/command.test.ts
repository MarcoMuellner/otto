import { describe, expect, it } from "vitest"

import { parseCommand } from "../../src/cli/command.js"

describe("parseCommand", () => {
  it("defaults to serve when no command is provided", () => {
    expect(parseCommand([])).toBe("serve")
  })

  it("returns setup when setup is provided", () => {
    // Arrange
    const argv = ["setup"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toBe("setup")
  })

  it("returns telegram-worker when command is provided", () => {
    // Arrange
    const argv = ["telegram-worker"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toBe("telegram-worker")
  })

  it("throws for unknown commands", () => {
    // Arrange
    const argv = ["unknown"]

    // Act and Assert
    expect(() => parseCommand(argv)).toThrow("Unknown command")
  })
})
