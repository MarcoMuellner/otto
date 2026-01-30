import WebSocket from "ws";

import { describe, expect, test } from "vitest";

import { buildServer } from "@server/server/app";

function waitForOpenOrError(socket: WebSocket): Promise<"open" | "error"> {
  return new Promise((resolve) => {
    socket.once("open", () => resolve("open"));
    socket.once("error", () => resolve("error"));
  });
}

describe("websocket auth", () => {
  test("rejects websocket without auth", async () => {
    // Arrange - start server
    const server = buildServer({ authToken: "test-token" });
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    const port = typeof address === "string" ? 0 : address?.port;

    // Act - connect without token
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const result = await waitForOpenOrError(socket);

    // Assert - connection fails
    expect(result).toBe("error");

    // Cleanup - close server
    socket.close();
    await server.close();
  });

  test("accepts websocket with header token", async () => {
    // Arrange - start server
    const server = buildServer({ authToken: "test-token" });
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    const port = typeof address === "string" ? 0 : address?.port;

    // Act - connect with auth header
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Authorization: "Bearer test-token" },
    });
    const result = await waitForOpenOrError(socket);

    // Assert - connection succeeds
    expect(result).toBe("open");

    // Cleanup - close server
    socket.close();
    await server.close();
  });

  test("accepts websocket with query token", async () => {
    // Arrange - start server
    const server = buildServer({ authToken: "test-token" });
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    const port = typeof address === "string" ? 0 : address?.port;

    // Act - connect with query token
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=test-token`);
    const result = await waitForOpenOrError(socket);

    // Assert - connection succeeds
    expect(result).toBe("open");

    // Cleanup - close server
    socket.close();
    await server.close();
  });
});
