import { describe, expect, test } from "vitest";

import { sum } from "@configManager/sum";

describe("sum", () => {
  test("adds two numbers", () => {
    const result = sum(2, 3);

    expect(result).toBe(5);
  });
});
