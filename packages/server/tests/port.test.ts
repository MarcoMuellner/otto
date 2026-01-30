import net from "node:net";

import { describe, expect, test } from "vitest";

import { findAvailablePort } from "@server/server/port";

describe("findAvailablePort", () => {
  test("returns the next available port when occupied", async () => {
    // Arrange - occupy an available port
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "string" ? 0 : (address?.port ?? 0);

    // Act - find next available port
    const nextPort = await findAvailablePort(port);

    // Assert - next port increments
    expect(nextPort).toBe(port + 1);

    // Cleanup - close server
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
