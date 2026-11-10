import { describe, expect, it } from "vitest";

import { decideHostPrimaryButton } from "@/src/lib/host/primary-button";

describe("decideHostPrimaryButton — presenting", () => {
  it("lets the host begin answering from a live presenting question", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "presenting",
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("begin_answering");
    expect(decision.label).toBe("התחלת מענה ←");
    expect(decision.disabled).toBe(false);
  });

  it("blocks begin answering while paused", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "paused",
      questionStatus: "presenting",
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("begin_answering");
    expect(decision.disabled).toBe(true);
  });
});

describe("manual close for untimed stations", () => {
  it.each([
    ["live", false, false],
    ["live", true, true],
    ["paused", false, true],
  ] as const)(
    "%s with timeLimitEnabled=%s has disabled=%s",
    (sessionStatus, timeLimitEnabled, disabled) => {
      const decision = decideHostPrimaryButton({
        sessionStatus,
        timeLimitEnabled,
        questionStatus: "answering",
        deadlinePassed: false,
        hasNextQuestion: true,
        isLastQuestion: false,
      });
      expect(decision.action).toBe("reveal");
      expect(decision.disabled).toBe(disabled);
    },
  );
});
