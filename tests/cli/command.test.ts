import { describe, expect, it } from "vitest"

import { parseCommand } from "../../src/cli/command.js"

describe("parseCommand", () => {
  it("defaults to serve when no command is provided", () => {
    expect(parseCommand([])).toBe("serve")
  })

  it("returns setup when setup is provided", () => {
    expect(parseCommand(["setup"])).toBe("setup")
  })

  it("throws for unknown commands", () => {
    expect(() => parseCommand(["unknown"])).toThrow("Unknown command")
  })
})
