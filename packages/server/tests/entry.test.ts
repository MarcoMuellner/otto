import { describe, expect, test, vi } from "vitest";

import { runServer } from "@server/index";

vi.mock("@server/server/bootstrap", () => ({
  bootstrap: vi.fn(async () => ({ stop: vi.fn() })),
}));

describe("runServer", () => {
  test("boots with test token", async () => {
    // Arrange - load mocked bootstrap
    const { bootstrap } = await import("@server/server/bootstrap");

    // Act - run server entry
    const runtime = await runServer();

    // Assert - starts with test token
    expect(bootstrap).toHaveBeenCalledWith({
      authToken: "test-token",
      host: "0.0.0.0",
      port: 14868,
    });
    expect(runtime).toBeDefined();
  });
});
