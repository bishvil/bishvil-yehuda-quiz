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
      map: {
        geo: {
          target: { lat: 31.5, lng: 34.9 },
          toleranceKm: 5,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects map payloads without a geo block", () => {
    const parsed = validateStoredQuestionContent({
      type: "map",
      options: null,
      map: { target: { lat: 31.5, lng: 34.9 } },
    });

    expect(parsed.success).toBe(false);
  });
});
