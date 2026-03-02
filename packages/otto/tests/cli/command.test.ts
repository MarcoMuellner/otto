import { describe, expect, it } from "vitest"

import { parseCommand } from "../../src/cli/command.js"

describe("parseCommand", () => {
  it("defaults to serve when no command is provided", () => {
    expect(parseCommand([])).toEqual({ name: "serve" })
  })

  it("returns setup when setup is provided", () => {
    // Arrange
    const argv = ["setup"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toEqual({ name: "setup" })
  })

  it("returns telegram-worker when command is provided", () => {
    // Arrange
    const argv = ["telegram-worker"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toEqual({ name: "telegram-worker" })
  })

  it("returns doctor fast mode when doctor is provided without flags", () => {
    // Arrange
    const argv = ["doctor"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toEqual({
      name: "doctor",
      mode: "fast",
    })
  })

  it("returns doctor deep mode when --deep is provided", () => {
    // Arrange
    const argv = ["doctor", "--deep"]

    // Act
    const command = parseCommand(argv)

    // Assert
    expect(command).toEqual({
      name: "doctor",
      mode: "deep",
    })
  })

  it("throws for --deep without doctor command", () => {
    // Arrange
    const argv = ["serve", "--deep"]

    // Act and Assert
    expect(() => parseCommand(argv)).toThrow("Unknown option '--deep'")
  })

  it("throws for unknown doctor flags", () => {
    // Arrange
    const argv = ["doctor", "--unknown"]

    // Act and Assert
    expect(() => parseCommand(argv)).toThrow("unknown option")
  })

  it("throws for unknown commands", () => {
    // Arrange
    const argv = ["unknown"]

    // Act and Assert
    expect(() => parseCommand(argv)).toThrow("Unknown command")
  })
})
