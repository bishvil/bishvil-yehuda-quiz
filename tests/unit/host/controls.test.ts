import { describe, expect, it } from "vitest";

import {
  computeAnswerBars,
  decideHostPrimaryButton,
} from "@/src/lib/host/controls";

describe("decideHostPrimaryButton", () => {
  it("starts the session when scheduled with questions available", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "scheduled",
      questionStatus: null,
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("start_session");
    expect(decision.disabled).toBe(false);
  });

  it("disables session start when the quiz is empty", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "scheduled",
      questionStatus: null,
      deadlinePassed: false,
      hasNextQuestion: false,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("start_session");
    expect(decision.disabled).toBe(true);
    expect(decision.hint).not.toBeNull();
  });

  it("offers start_question while live without an active question", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: null,
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("start_question");
    expect(decision.disabled).toBe(false);
  });

  it("disables start_question while paused", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "paused",
      questionStatus: null,
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("start_question");
    expect(decision.disabled).toBe(true);
  });

  it("blocks reveal while a question is still answering before deadline", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "answering",
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("reveal");
    expect(decision.disabled).toBe(true);
  });

  it("enables reveal once the deadline passes (locked-pending or locked)", () => {
    const passed = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "answering",
      deadlinePassed: true,
      hasNextQuestion: true,
      isLastQuestion: false,
    });
    const locked = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "locked",
      deadlinePassed: false,
      hasNextQuestion: true,
      isLastQuestion: false,
    });

    expect(passed.action).toBe("reveal");
    expect(passed.disabled).toBe(false);
    expect(locked.disabled).toBe(false);
  });

  it("advances on revealed and labels the final question as סיום", () => {
    const advanced = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "revealed",
      deadlinePassed: true,
      hasNextQuestion: true,
      isLastQuestion: false,
    });
    expect(advanced.action).toBe("advance");
    expect(advanced.label).toContain("הבאה");

    const finalAdvance = decideHostPrimaryButton({
      sessionStatus: "live",
      questionStatus: "revealed",
      deadlinePassed: true,
      hasNextQuestion: false,
      isLastQuestion: true,
    });
    expect(finalAdvance.action).toBe("advance");
    expect(finalAdvance.label).toContain("סיום");
  });

  it("returns ended state when the session has finished", () => {
    const decision = decideHostPrimaryButton({
      sessionStatus: "ended",
      questionStatus: null,
      deadlinePassed: false,
      hasNextQuestion: false,
      isLastQuestion: false,
    });

    expect(decision.action).toBe("ended");
    expect(decision.disabled).toBe(true);
  });
});

describe("computeAnswerBars", () => {
  it("returns zero counts when there are no answers yet", () => {
    const bars = computeAnswerBars({
      options: [{ id: "a" }, { id: "b" }],
      counts: {},
    });

    expect(bars).toEqual([
      { optionId: "a", count: 0, percent: 0, fillFraction: 0 },
      { optionId: "b", count: 0, percent: 0, fillFraction: 0 },
    ]);
  });

  it("computes percent over total and fillFraction over the max", () => {
    const bars = computeAnswerBars({
      options: [{ id: "a" }, { id: "b" }, { id: "c" }],
      counts: { a: 6, b: 3, c: 1 },
    });

    expect(bars[0]).toMatchObject({ optionId: "a", count: 6, percent: 60 });
    expect(bars[1]).toMatchObject({ optionId: "b", count: 3, percent: 30 });
    expect(bars[2]).toMatchObject({ optionId: "c", count: 1, percent: 10 });

    // fill fractions are normalised so the most-popular bar fills the column.
    expect(bars[0]?.fillFraction).toBeCloseTo(1, 5);
    expect(bars[1]?.fillFraction).toBeCloseTo(0.5, 5);
    expect(bars[2]?.fillFraction).toBeCloseTo(1 / 6, 5);
  });

  it("ignores keys that aren't in the option list", () => {
    const bars = computeAnswerBars({
      options: [{ id: "a" }, { id: "b" }],
      counts: { a: 2, b: 2, ghost: 99 },
    });

    expect(bars).toHaveLength(2);
    expect(bars.every((bar) => bar.percent === 50)).toBe(true);
  });
});
