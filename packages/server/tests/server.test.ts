import { describe, expect, test } from "vitest";

import { buildServer } from "@server/server/app";

describe("server auth", () => {
  test("serves health without auth", async () => {
    // Arrange - build server instance with token
    const server = buildServer({ authToken: "test-token" });

    // Act - request public health endpoint
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    // Assert - responds with OK
    expect(response.statusCode).toBe(200);

    // Cleanup - close server
    await server.close();
  });

  test("rejects secured routes without auth", async () => {
    // Arrange - build server instance with token
    const server = buildServer({ authToken: "test-token" });

    // Act - request secured endpoint without auth
    const response = await server.inject({
      method: "GET",
      url: "/api/ping",
    });

    // Assert - rejects without token
    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");

    // Cleanup - close server
    await server.close();
  });

  test("accepts secured routes with auth", async () => {
    // Arrange - build server instance with token
    const server = buildServer({ authToken: "test-token" });

    // Act - request secured endpoint with auth
    const response = await server.inject({
      method: "GET",
      url: "/api/ping",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    // Assert - accepts valid token
    expect(response.statusCode).toBe(200);

    // Cleanup - close server
    await server.close();
  });
});
