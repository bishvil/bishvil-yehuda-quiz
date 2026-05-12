import { describe, expect, it } from "vitest";

import {
  computeAnswerSeconds,
  formatAnswerSeconds,
} from "@/src/lib/time/answer-duration";

describe("answer duration helpers", () => {
  it("computes elapsed time from the configured question timer", () => {
    expect(
      computeAnswerSeconds({
        submittedAt: "2026-05-12T00:00:12.100Z",
        deadlineAt: "2026-05-12T00:00:45.000Z",
        timeSeconds: 45,
      }),
    ).toBe(13);
  });

  it("caps media-padded deadlines at the configured question time", () => {
    expect(
      computeAnswerSeconds({
        submittedAt: "2026-05-12T00:00:02.000Z",
        deadlineAt: "2026-05-12T00:01:00.000Z",
        timeSeconds: 45,
      }),
    ).toBe(0);
  });

  it("formats Hebrew answer time labels", () => {
    expect(formatAnswerSeconds(0)).toBe("פחות משנייה");
    expect(formatAnswerSeconds(1)).toBe("שנייה אחת");
    expect(formatAnswerSeconds(12)).toBe("12 שניות");
  });
});
