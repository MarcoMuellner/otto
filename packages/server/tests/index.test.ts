import { describe, expect, test, vi } from "vitest";

import { startServer } from "@server/index";

vi.mock("@server/server/bootstrap", () => ({
  bootstrap: vi.fn(async () => ({ stop: vi.fn() })),
}));

describe("startServer", () => {
  test("boots with defaults", async () => {
    // Arrange - load mocked bootstrap
    const { bootstrap } = await import("@server/server/bootstrap");

    // Act - start server
    const runtime = await startServer({ authToken: "test-token" });

    // Assert - calls bootstrap and returns runtime
    expect(bootstrap).toHaveBeenCalledWith({
      authToken: "test-token",
      host: "0.0.0.0",
      port: 14868,
    });
    expect(runtime).toBeDefined();
  });
});
