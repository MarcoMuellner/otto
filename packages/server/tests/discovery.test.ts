import { describe, expect, test, vi } from "vitest";

import { startDiscovery } from "@server/server/discovery";

const publishMock = vi.fn();
const stopMock = vi.fn((callback?: () => void) => callback?.());
const destroyMock = vi.fn();

vi.mock("bonjour-service", () => ({
  Bonjour: class {
    publish = publishMock;
    destroy = destroyMock;
  },
}));

describe("startDiscovery", () => {
  test("publishes service and allows cleanup", async () => {
    // Arrange - prepare publish return
    publishMock.mockReturnValue({ stop: stopMock });

    // Act - start discovery and stop it
    const handle = startDiscovery({ name: "otto", port: 14868 });
    await handle.stop();

    // Assert - publishes and cleans up
    expect(publishMock).toHaveBeenCalledWith({
      name: "otto",
      type: "otto",
      protocol: "tcp",
      port: 14868,
    });
    expect(stopMock).toHaveBeenCalled();
    expect(destroyMock).toHaveBeenCalled();
  });
});
