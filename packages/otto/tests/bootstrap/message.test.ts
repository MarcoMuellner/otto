import { describe, expect, it } from "vitest"

import { buildBootstrapMessage } from "../../src/bootstrap/message.js"

describe("buildBootstrapMessage", () => {
  it("formats the startup message with timestamp", () => {
    const timestamp = "2026-02-16T12:00:00.000Z"

    expect(buildBootstrapMessage(timestamp)).toBe(
      "[otto] bootstrap ready (2026-02-16T12:00:00.000Z)"
    )
  })
})
