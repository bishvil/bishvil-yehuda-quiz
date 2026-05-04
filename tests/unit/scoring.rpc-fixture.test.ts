import { describe, expect, it } from "vitest";

import casesFixture from "@/tests/fixtures/scoring/cases.json" with { type: "json" };

/**
 * Contract test for the `submit_answer` RPC (ADR-0006). The fixture in
 * `tests/fixtures/scoring/cases.json` is the source of truth for expected
 * scoring behaviour. End-to-end verification (a real session, real
 * answer rows, real RPC) lives in Playwright; this unit test guards
 * the fixture's *internal* consistency so reviewers can read it as a
 * specification without needing Postgres on hand.
 *
 * Each case may declare expected values in two forms:
 *  - exact:   `score: 500`
 *  - range:   `score_min: 480`, `score_max: 520` (allows haversine FP slop
 *             on geo cases and Jaccard rounding on multi cases)
 *
 * The structural assertions below catch fixture rot — e.g. someone
 * changes the formula and forgets to refresh the fixture, leaving an
 * impossible expected (score>0 with is_correct=false on a binary type,
 * ratio outside [0,1], or a multi case missing a Jaccard expectation).
 */

interface Bound {
  min?: number;
  max?: number;
  exact?: number | null;
}

interface FixtureCase {
  name: string;
  type: "single" | "multi" | "map" | "image" | "truefalse";
  points: number;
  time_seconds: number;
  correct_ids?: string[];
  map?: { geo?: { target: { lat: number; lng: number }; toleranceKm: number } };
  input: {
    selected_ids?: string[];
    pin_lat?: number;
    pin_lng?: number;
  };
  expected: Record<string, number | boolean | null>;
}

interface Fixture {
  cases: FixtureCase[];
}

const fixture = casesFixture as unknown as Fixture;

function bound(expected: FixtureCase["expected"], key: string): Bound {
  return {
    exact: expected[key] as number | null | undefined,
    min: expected[`${key}_min`] as number | undefined,
    max: expected[`${key}_max`] as number | undefined,
  };
}

function isWellFormed(b: Bound): boolean {
  if (b.exact !== undefined) return b.min === undefined && b.max === undefined;
  return b.min !== undefined && b.max !== undefined && b.min <= b.max;
}

describe("submit_answer fixture (ADR-0006)", () => {
  it("contains at least one case per question type the RPC handles", () => {
    const types = new Set(fixture.cases.map((c) => c.type));
    expect(types.has("single")).toBe(true);
    expect(types.has("multi")).toBe(true);
    expect(types.has("map")).toBe(true);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "case %s has well-formed expected bounds",
    (_name, c) => {
      expect(typeof c.expected.is_correct).toBe("boolean");

      for (const key of ["score", "correctness_ratio", "time_bonus", "distance_km"]) {
        const b = bound(c.expected, key);
        // null is a valid exact value (e.g. distance_km on non-geo types).
        if (b.exact === null) continue;
        const present =
          b.exact !== undefined || b.min !== undefined || b.max !== undefined;
        expect(present, `case ${c.name}: missing expected for ${key}`).toBe(true);
        expect(isWellFormed(b)).toBe(true);
      }
    },
  );

  it("score and ratio expectations are mutually consistent", () => {
    for (const c of fixture.cases) {
      const score = bound(c.expected, "score");
      const ratio = bound(c.expected, "correctness_ratio");
      const isCorrect = c.expected.is_correct as boolean;

      const scoreLow = score.exact ?? score.min ?? 0;
      const ratioLow = ratio.exact ?? ratio.min ?? 0;
      const ratioHigh = ratio.exact ?? ratio.max ?? 1;

      // ratio must be in [0, 1].
      expect(ratioLow).toBeGreaterThanOrEqual(0);
      expect(ratioHigh).toBeLessThanOrEqual(1);

      // ratio = 0 ⇒ score = 0 (no time bonus when ratio=0 implies is_correct=false).
      if (ratioHigh === 0) {
        expect(scoreLow).toBe(0);
        expect(isCorrect).toBe(false);
      }

      // is_correct=true ⇒ ratio > 0.
      if (isCorrect) {
        expect(ratioHigh).toBeGreaterThan(0);
      }
    }
  });

  it("base = floor(points * 2/3) and time_max = points - base for every case", () => {
    for (const c of fixture.cases) {
      const base = Math.floor((c.points * 2) / 3);
      const timeMax = c.points - base;
      const isCorrect = c.expected.is_correct as boolean;
      const tb = bound(c.expected, "time_bonus");
      const tbHigh = tb.exact ?? tb.max ?? 0;

      // Time bonus never exceeds time_max.
      expect(tbHigh).toBeLessThanOrEqual(timeMax);

      // Wrong answers (is_correct=false) earn zero time bonus by design.
      if (!isCorrect) expect(tbHigh).toBe(0);

      // Correct + answered at t=0 earns the full time_max (within rounding).
      if (
        isCorrect &&
        c["submit_offset_seconds_from_start" as keyof FixtureCase] === 0
      ) {
        expect(tbHigh).toBeGreaterThanOrEqual(timeMax - 1);
      }

      // Score upper bound never exceeds points.
      const sc = bound(c.expected, "score");
      const scHigh = sc.exact ?? sc.max ?? 0;
      expect(scHigh).toBeLessThanOrEqual(c.points);

      // For perfect-correct cases, scoreHigh = base + time_bonus_high (within 1).
      if (
        isCorrect &&
        (c.expected.correctness_ratio === 1 ||
          c.expected.correctness_ratio_max === 1)
      ) {
        expect(scHigh).toBeGreaterThanOrEqual(base + tbHigh - 1);
      }
    }
  });
});
