import { describe, expect, test } from "vitest";

import { getAuthToken } from "@server/server/auth";

describe("getAuthToken", () => {
  test("reads token from authorization header", () => {
    // Arrange - build request with bearer token
    const request = {
      headers: { authorization: "Bearer test-token" },
      url: "/api/ping",
    };

    // Act - extract token
    const token = getAuthToken(request as never);

    // Assert - returns header token
    expect(token).toBe("test-token");
  });

  test("reads token from query string", () => {
    // Arrange - build request with query token
    const request = {
      headers: {},
      url: "/ws?token=query-token",
    };

    // Act - extract token
    const token = getAuthToken(request as never);

    // Assert - returns query token
    expect(token).toBe("query-token");
  });

  test("returns null when token is missing", () => {
    // Arrange - build request without token
    const request = {
      headers: {},
      url: "/api/ping",
    };

    // Act - extract token
    const token = getAuthToken(request as never);

    // Assert - reports missing token
    expect(token).toBeNull();
  });
});
