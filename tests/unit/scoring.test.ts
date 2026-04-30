import { describe, expect, it } from "vitest";

import {
  computeScore,
  isChoiceAnswerCorrect,
  isMapAnswerCorrect,
} from "@/src/lib/scoring";

describe("scoring formula (ADR-0006 §5)", () => {
  const startedAt = new Date("2026-05-01T10:00:00Z");
  const deadlineAt = new Date("2026-05-01T10:00:25Z");

  it("returns 0 when the answer is wrong, regardless of timing", () => {
    const result = computeScore({
      isCorrect: false,
      points: 1500,
      startedAt,
      deadlineAt,
      submittedAt: new Date("2026-05-01T10:00:01Z"),
      timeSeconds: 25,
    });

    expect(result.score).toBe(0);
    expect(result.timeBonus).toBe(0);
    expect(result.base).toBe(1000);
    expect(result.timeMax).toBe(500);
  });

  it("awards full base + full time bonus when answered immediately", () => {
    const result = computeScore({
      isCorrect: true,
      points: 1500,
      startedAt,
      deadlineAt,
      submittedAt: startedAt,
      timeSeconds: 25,
    });

    // remaining = 25_000ms, timeMax = 500, so timeBonus = floor(500*1) = 500.
    expect(result.timeBonus).toBe(500);
    expect(result.score).toBe(1500);
  });

  it("awards 0 time bonus when answered exactly at the deadline", () => {
    const result = computeScore({
      isCorrect: true,
      points: 1500,
      startedAt,
      deadlineAt,
      submittedAt: deadlineAt,
      timeSeconds: 25,
    });

    expect(result.timeBonus).toBe(0);
    expect(result.score).toBe(1000);
  });

  it("scales with custom point overrides — Open Q1 RESOLVED", () => {
    const result = computeScore({
      isCorrect: true,
      points: 900,
      startedAt,
      deadlineAt,
      submittedAt: startedAt,
      timeSeconds: 25,
    });

    // base = floor(900 * 2/3) = 600, timeMax = 300.
    expect(result.base).toBe(600);
    expect(result.timeMax).toBe(300);
    expect(result.score).toBe(900);
  });
});

describe("choice answer correctness", () => {
  it("treats option order as irrelevant for multi-select", () => {
    expect(isChoiceAnswerCorrect(["b", "a"], ["a", "b"])).toBe(true);
  });

  it("rejects partial selections", () => {
    expect(isChoiceAnswerCorrect(["a"], ["a", "b"])).toBe(false);
  });

  it("rejects supersets", () => {
    expect(isChoiceAnswerCorrect(["a", "b", "c"], ["a", "b"])).toBe(false);
  });
});

describe("map answer correctness", () => {
  it("accepts pins inside the tolerance radius", () => {
    expect(
      isMapAnswerCorrect({ x: 50.5, y: 49.5 }, { x: 50, y: 50 }, 1),
    ).toBe(true);
  });

  it("rejects pins outside the tolerance radius", () => {
    expect(
      isMapAnswerCorrect({ x: 60, y: 60 }, { x: 50, y: 50 }, 1),
    ).toBe(false);
  });
});
