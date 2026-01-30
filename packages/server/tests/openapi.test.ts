import { describe, expect, test } from "vitest";

import { buildServer } from "@server/server/app";

describe("openapi", () => {
  test("serves openapi document", async () => {
    // Arrange - build server instance with token
    const server = buildServer({ authToken: "test-token" });

    // Act - request openapi document
    const response = await server.inject({
      method: "GET",
      url: "/openapi.json",
    });

    // Assert - responds with schema
    expect(response.statusCode).toBe(200);

    // Cleanup - close server
    await server.close();
  });
});
