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

describe("informational station actions", () => {
  it.each(["live", "paused"] as const)(
    "opens a video information station while %s",
    (sessionStatus) => {
      const decision = decideHostPrimaryButton({
        sessionStatus,
        questionType: "content",
        questionStatus: "presenting",
        deadlinePassed: false,
        hasNextQuestion: true,
        isLastQuestion: false,
      });
      expect(decision.action).toBe("begin_answering");
      expect(decision.label).toBe("פתיחת תחנת המידע ←");
      expect(decision.disabled).toBe(sessionStatus === "paused");
    },
  );
  it.each(["live", "paused"] as const)(
    "uses information-station copy while %s",
    (sessionStatus) => {
      const decision = decideHostPrimaryButton({
        sessionStatus,
        questionType: "content",
        questionStatus: "answering",
        deadlinePassed: false,
        hasNextQuestion: true,
        isLastQuestion: false,
      });
      expect(decision.action).toBe("reveal");
      expect(decision.label).toBe("סיום תחנת המידע ←");
      expect(decision.disabled).toBe(sessionStatus === "paused");
      expect(decision.hint).not.toContain("התשובה");
    },
  );

  it("offers the next station after the information station is closed", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "live",
      questionType: "content",
      questionStatus: "revealed",
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });
    expect(decision.action).toBe("advance");
    expect(decision.label).toBe("לתחנה הבאה ←");
    expect(decision.disabled).toBe(false);
  });
});
