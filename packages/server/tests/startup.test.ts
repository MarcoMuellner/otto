import { describe, expect, test, vi } from "vitest";

import { logStartup } from "@server/server/startup";

describe("logStartup", () => {
  test("writes the banner to the logger", () => {
    // Arrange - spy on console output
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    // Act - log startup banner
    logStartup({ host: "0.0.0.0", port: 14868 });

    // Assert - logs banner message
    const [message] = consoleSpy.mock.calls[0] ?? [];
    expect(message).toContain("Otto Gateway");
    expect(message).toContain("Listening on 0.0.0.0:14868");

    // Cleanup - restore console output
    consoleSpy.mockRestore();
  });
});
