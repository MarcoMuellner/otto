import { describe, expect, test, vi } from "vitest";

import { installShutdownHandlers } from "@server/server/shutdown";

describe("installShutdownHandlers", () => {
  test("calls stop on SIGINT", async () => {
    // Arrange - create stop spy
    const stop = vi.fn().mockResolvedValue(undefined);
    const removeListener = vi.spyOn(process, "removeListener");

    // Act - install and trigger shutdown
    const uninstall = installShutdownHandlers(stop);
    process.emit("SIGINT");
    await new Promise((resolve) => setImmediate(resolve));
    uninstall();

    // Assert - stop was called and listeners removed
    expect(stop).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalled();
  });
});
