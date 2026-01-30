import { describe, expect, test, vi } from "vitest";

import { bootstrap } from "@server/server/bootstrap";

vi.mock("@server/server/discovery", () => ({
  startDiscovery: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock("@server/server/port", () => ({
  findAvailablePort: vi.fn(async () => 14869),
}));

describe("bootstrap", () => {
  test("starts and stops the server", async () => {
    // Arrange - boot with test token
    const { findAvailablePort } = await import("@server/server/port");
    const runtime = await bootstrap({
      authToken: "test-token",
      host: "127.0.0.1",
      port: 14868,
    });

    // Act - stop runtime
    await runtime.stop();

    // Assert - runtime is defined
    expect(findAvailablePort).toHaveBeenCalledWith(14868);
    expect(runtime).toBeDefined();
  });
});
