import { describe, expect, test, vi } from "vitest";

import { bootstrap } from "@server/server/bootstrap";

vi.mock("@server/server/discovery", () => ({
  startDiscovery: vi.fn(() => ({ stop: vi.fn() })),
}));

describe("bootstrap", () => {
  test("starts and stops the server", async () => {
    // Arrange - boot with test token
    const runtime = await bootstrap({
      authToken: "test-token",
      host: "127.0.0.1",
      port: 0,
    });

    // Act - stop runtime
    await runtime.stop();

    // Assert - runtime is defined
    expect(runtime).toBeDefined();
  });
});
