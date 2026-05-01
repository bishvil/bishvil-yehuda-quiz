import { describe, expect, it } from "vitest";

import { validateStoredQuestionContent } from "@/src/lib/schemas/question-content";

describe("stored question content schemas", () => {
  it("accepts valid choice options", () => {
    const parsed = validateStoredQuestionContent({
      type: "single",
      options: [{ id: "a", text: "Option A", image_url: "/a.png" }],
      map: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects malformed choice options", () => {
    const parsed = validateStoredQuestionContent({
      type: "multi",
      options: [{ id: "", label: "Missing text" }],
      map: null,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts valid map payloads", () => {
    const parsed = validateStoredQuestionContent({
      type: "map",
      options: null,
      map: { image_url: "/map.jpg", target: { x: 42, y: 64 } },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects malformed map payloads", () => {
    const parsed = validateStoredQuestionContent({
      type: "map",
      options: null,
      map: { image_url: "/map.jpg" },
    });

    expect(parsed.success).toBe(false);
  });
});
