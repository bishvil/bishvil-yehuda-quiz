import { describe, expect, it } from "vitest";

import {
  jaccardRatio,
  scoreMapAnswerProximity,
  scoreMultiAnswer,
} from "@/src/lib/scoring";

// Shared timing fixture — a 25-second question window where the participant
// answers immediately (full time bonus available unless overridden below).
const BASE_TIMING = {
  startedAt: new Date("2026-05-01T10:00:00Z"),
  deadlineAt: new Date("2026-05-01T10:00:25Z"),
  submittedAt: new Date("2026-05-01T10:00:00Z"), // answered at t=0 → full time bonus
  timeSeconds: 25,
};

const POINTS = 1500;
// base = floor(1500 * 2/3) = 1000, timeMax = 500
const BASE = 1000;
const TIME_MAX = 500;

// ============================================================================
// jaccardRatio
// ============================================================================

describe("jaccardRatio", () => {
  it("returns 1 on identical sets", () => {
    expect(jaccardRatio(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 1 regardless of order", () => {
    expect(jaccardRatio(["c", "a", "b"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 on completely disjoint sets", () => {
    expect(jaccardRatio(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("computes partial overlap correctly: {a,b} vs {b,c} = 1/3", () => {
    // intersection {b} = 1, union {a,b,c} = 3
    expect(jaccardRatio(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3, 9);
  });

  it("extra wrong picks penalise: {a,b,c} vs {a} = 1/3", () => {
    // intersection {a} = 1, union {a,b,c} = 3
    expect(jaccardRatio(["a", "b", "c"], ["a"])).toBeCloseTo(1 / 3, 9);
  });

  it("missed correct picks penalise: {a} vs {a,b} = 1/2", () => {
    // intersection {a} = 1, union {a,b} = 2
    expect(jaccardRatio(["a"], ["a", "b"])).toBeCloseTo(1 / 2, 9);
  });

  it("returns 0 for empty selected against non-empty correct", () => {
    expect(jaccardRatio([], ["a", "b"])).toBe(0);
  });

  it("returns 0 for empty vs empty (guard against 0/0)", () => {
    expect(jaccardRatio([], [])).toBe(0);
  });

  it("deduplicates duplicate entries in selected array", () => {
    // Duplicates in selected should not inflate intersection or deflate union.
    expect(jaccardRatio(["a", "a", "b"], ["a", "b"])).toBe(1);
  });
});

// ============================================================================
// scoreMapAnswerProximity
// ============================================================================

describe("scoreMapAnswerProximity", () => {
  const TOLERANCE_KM = 10;

  it("d=0 → full base score + full time bonus", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: 0,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
    });
    // ratio = 1 - 0/10 = 1.0
    expect(result.ratio).toBeCloseTo(1, 9);
    // score = floor(1000 * 1) + 500 = 1500
    expect(result.score).toBe(1500);
    expect(result.timeBonus).toBe(TIME_MAX);
    expect(result.base).toBe(BASE);
    expect(result.timeMax).toBe(TIME_MAX);
  });

  it("d=tolerance/2 → ratio ≈ 0.5, base ≈ 500, no time bonus check", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: TOLERANCE_KM / 2,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
    });
    // ratio = 1 - 5/10 = 0.5
    expect(result.ratio).toBeCloseTo(0.5, 9);
    // score = floor(1000 * 0.5) + 500 = 1000  (is_correct=true, full time bonus)
    expect(result.score).toBe(1000);
  });

  it("d=tolerance → ratio=0, is_correct=false, score=0", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: TOLERANCE_KM,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
    });
    // Strict boundary: d=tol is NOT correct
    expect(result.ratio).toBe(0);
    expect(result.score).toBe(0);
    expect(result.timeBonus).toBe(0);
  });

  it("d>tolerance → score=0, time bonus=0", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: TOLERANCE_KM + 5,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.ratio).toBe(0);
    expect(result.score).toBe(0);
    expect(result.timeBonus).toBe(0);
  });

  it("time bonus = 0 when answer is at the deadline (even if in tolerance)", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: 0,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
      submittedAt: BASE_TIMING.deadlineAt, // no time remaining
    });
    expect(result.timeBonus).toBe(0);
    // score = floor(1000 * 1) + 0 = 1000
    expect(result.score).toBe(BASE);
  });

  it("scales base and timeMax with custom points", () => {
    // points = 900 → base = 600, timeMax = 300
    const result = scoreMapAnswerProximity({
      distanceKm: 0,
      toleranceKm: TOLERANCE_KM,
      points: 900,
      ...BASE_TIMING,
    });
    expect(result.base).toBe(600);
    expect(result.timeMax).toBe(300);
    expect(result.score).toBe(900);
  });

  it("returns correct result shape", () => {
    const result = scoreMapAnswerProximity({
      distanceKm: 2,
      toleranceKm: TOLERANCE_KM,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result).toMatchObject<typeof result>({
      score: expect.any(Number),
      ratio: expect.any(Number),
      timeBonus: expect.any(Number),
      base: expect.any(Number),
      timeMax: expect.any(Number),
    });
  });
});

// ============================================================================
// scoreMultiAnswer
// ============================================================================

describe("scoreMultiAnswer", () => {
  it("ratio=1 → full base + full time bonus", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: 1,
      points: POINTS,
      ...BASE_TIMING,
    });
    // is_correct = true, score = floor(1000 * 1) + 500 = 1500
    expect(result.score).toBe(1500);
    expect(result.ratio).toBe(1);
    expect(result.timeBonus).toBe(TIME_MAX);
  });

  it("ratio=0 → score=0, timeBonus=0", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: 0,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.score).toBe(0);
    expect(result.timeBonus).toBe(0);
  });

  it("partial ratio=0.5 → floor(1000*0.5)=500, no time bonus", () => {
    // is_correct = false (not 1.0), so no time bonus
    const result = scoreMultiAnswer({
      correctnessRatio: 0.5,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.score).toBe(500);
    expect(result.timeBonus).toBe(0);
    expect(result.ratio).toBeCloseTo(0.5);
  });

  it("ratio=1 at deadline → base only, no time bonus", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: 1,
      points: POINTS,
      ...BASE_TIMING,
      submittedAt: BASE_TIMING.deadlineAt,
    });
    expect(result.timeBonus).toBe(0);
    expect(result.score).toBe(BASE);
  });

  it("ratio just under 1 (e.g. 3/4) does not earn time bonus", () => {
    // Exact match required for time bonus
    const result = scoreMultiAnswer({
      correctnessRatio: 0.75,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.timeBonus).toBe(0);
    // score = floor(1000 * 0.75) = 750
    expect(result.score).toBe(750);
  });

  it("clamps ratio > 1 to 1 defensively", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: 1.5,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.ratio).toBe(1);
    expect(result.score).toBe(1500);
  });

  it("clamps negative ratio to 0 defensively", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: -0.5,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result.ratio).toBe(0);
    expect(result.score).toBe(0);
  });

  it("returns correct result shape", () => {
    const result = scoreMultiAnswer({
      correctnessRatio: 0.5,
      points: POINTS,
      ...BASE_TIMING,
    });
    expect(result).toMatchObject<typeof result>({
      score: expect.any(Number),
      ratio: expect.any(Number),
      timeBonus: expect.any(Number),
      base: expect.any(Number),
      timeMax: expect.any(Number),
    });
  });
});

// ============================================================================
// Integration: jaccardRatio → scoreMultiAnswer pipeline
// ============================================================================

describe("jaccardRatio → scoreMultiAnswer integration", () => {
  it("{a,b,c} vs {a,b,c}: full score", () => {
    const ratio = jaccardRatio(["a", "b", "c"], ["a", "b", "c"]);
    const { score } = scoreMultiAnswer({ correctnessRatio: ratio, points: POINTS, ...BASE_TIMING });
    expect(score).toBe(1500);
  });

  it("{a} vs {a,b,c}: score = floor(1000 * 1/3)", () => {
    // intersection {a}=1, union {a,b,c}=3, ratio=1/3
    const ratio = jaccardRatio(["a"], ["a", "b", "c"]);
    const { score } = scoreMultiAnswer({ correctnessRatio: ratio, points: POINTS, ...BASE_TIMING });
    // floor(1000 * 1/3) = 333
    expect(score).toBe(333);
  });

  it("{a,b,x} vs {a,b,c}: score < {a,b} vs {a,b,c} (extra wrong pick penalises)", () => {
    const ratioWithWrong = jaccardRatio(["a", "b", "x"], ["a", "b", "c"]);
    const ratioWithout = jaccardRatio(["a", "b"], ["a", "b", "c"]);
    expect(ratioWithWrong).toBeLessThan(ratioWithout);
  });
});
