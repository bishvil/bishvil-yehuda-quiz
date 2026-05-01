import { describe, expect, it } from "vitest";

import {
  computeScore,
  EARTH_RADIUS_KM,
  haversineKm,
  isChoiceAnswerCorrect,
  isMapAnswerCorrect,
  isMapAnswerCorrectGeo,
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

describe("map answer correctness (legacy %-distance, ADR-0006 §5)", () => {
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

describe("haversine distance (ADR-0011 §5)", () => {
  // Reference points used across multiple tests.
  const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };
  const JERUSALEM = { lat: 31.7683, lng: 35.2137 };
  const HAIFA = { lat: 32.794, lng: 34.9896 };

  it("returns 0 km for identical points", () => {
    expect(haversineKm(TEL_AVIV, TEL_AVIV)).toBeCloseTo(0, 5);
  });

  it("Tel Aviv ↔ Jerusalem is ≈ 54 km (great-circle)", () => {
    // Reference: ~54.1 km via standard haversine. Allow ±0.5 km.
    const km = haversineKm(TEL_AVIV, JERUSALEM);
    expect(km).toBeGreaterThan(53.5);
    expect(km).toBeLessThan(54.6);
  });

  it("Tel Aviv ↔ Haifa is ≈ 81 km", () => {
    // Reference: ~81.2 km via standard haversine. Allow ±1 km.
    const km = haversineKm(TEL_AVIV, HAIFA);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(82);
  });

  it("is symmetric in its arguments (within 1e-9 km)", () => {
    const a = haversineKm(TEL_AVIV, JERUSALEM);
    const b = haversineKm(JERUSALEM, TEL_AVIV);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });

  it("equator special-case: 1° of longitude at lat 0 = ~111.195 km", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    // Earth circumference / 360 = ~111.195. Allow 0.01.
    expect(km).toBeCloseTo((Math.PI * EARTH_RADIUS_KM) / 180, 1);
  });

  it("antipodal points return ≈ πR (≈ 20015 km) without NaN", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(km).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 0);
    expect(Number.isFinite(km)).toBe(true);
  });

  it("near-antipodal points stay finite (asin clamp guards FP error)", () => {
    // Floating-point error can push the radicand fractionally above 1
    // for true antipodes; the asin(min(1, ...)) clamp must hold.
    const km = haversineKm(
      { lat: 0.0000001, lng: 0.0000001 },
      { lat: -0.0000001, lng: 179.9999999 },
    );
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeGreaterThan(20000);
  });
});

describe("isMapAnswerCorrectGeo (ADR-0011 §5)", () => {
  const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };
  const JERUSALEM = { lat: 31.7683, lng: 35.2137 };

  it("accepts a pin inside the tolerance radius", () => {
    // Pin 1 km north of Tel Aviv, 5 km tolerance.
    expect(
      isMapAnswerCorrectGeo({ lat: 32.0943, lng: 34.7818 }, TEL_AVIV, 5),
    ).toBe(true);
  });

  it("rejects Jerusalem at a 10 km tolerance from Tel Aviv", () => {
    expect(isMapAnswerCorrectGeo(JERUSALEM, TEL_AVIV, 10)).toBe(false);
  });

  it("accepts Jerusalem at a 60 km tolerance from Tel Aviv", () => {
    expect(isMapAnswerCorrectGeo(JERUSALEM, TEL_AVIV, 60)).toBe(true);
  });

  it("treats the boundary as inclusive (distance == tolerance is correct)", () => {
    const km = haversineKm(TEL_AVIV, JERUSALEM);
    // Round to ms precision to avoid FP equality edge cases.
    expect(isMapAnswerCorrectGeo(JERUSALEM, TEL_AVIV, km)).toBe(true);
  });

  it("treats just-over-boundary as incorrect", () => {
    const km = haversineKm(TEL_AVIV, JERUSALEM);
    expect(isMapAnswerCorrectGeo(JERUSALEM, TEL_AVIV, km - 0.01)).toBe(false);
  });

  it("rejects when tolerance is non-finite (NaN or Infinity)", () => {
    expect(isMapAnswerCorrectGeo(TEL_AVIV, JERUSALEM, NaN)).toBe(false);
    expect(isMapAnswerCorrectGeo(TEL_AVIV, JERUSALEM, Infinity)).toBe(false);
    expect(isMapAnswerCorrectGeo(TEL_AVIV, JERUSALEM, -Infinity)).toBe(false);
  });

  it("rejects when tolerance is zero or negative", () => {
    expect(isMapAnswerCorrectGeo(TEL_AVIV, TEL_AVIV, 0)).toBe(false);
    expect(isMapAnswerCorrectGeo(TEL_AVIV, TEL_AVIV, -1)).toBe(false);
  });
});
