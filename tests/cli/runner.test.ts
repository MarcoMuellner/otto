import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import type { OttoCommand } from "../../src/cli/command.js"
import { runCommand } from "../../src/cli/runner.js"

describe("runCommand", () => {
  it("dispatches to the selected command handler", async () => {
    // Arrange
    const logger = {} as Logger
    const setupHandler = vi.fn(async () => {})
    const serveHandler = vi.fn(async () => {})

    // Act
    await runCommand("setup" satisfies OttoCommand, logger, {
      setup: setupHandler,
      serve: serveHandler,
    })

    // Assert
    expect(setupHandler).toHaveBeenCalledOnce()
    expect(serveHandler).not.toHaveBeenCalled()
  })
})
