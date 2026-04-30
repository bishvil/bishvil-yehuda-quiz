import { describe, expect, it } from "vitest";

describe("baseline smoke", () => {
  it("runs the unit-test toolchain", () => {
    expect(1 + 1).toBe(2);
  });

  it("has access to jsdom globals", () => {
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
  });
});
