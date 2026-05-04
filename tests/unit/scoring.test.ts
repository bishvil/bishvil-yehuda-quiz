import { describe, expect, it } from "vitest";

import { EARTH_RADIUS_KM, haversineKm } from "@/src/lib/scoring";

describe("haversineKm (ADR-0011 §5)", () => {
  const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };
  const JERUSALEM = { lat: 31.7683, lng: 35.2137 };
  const HAIFA = { lat: 32.794, lng: 34.9896 };

  it("returns 0 km for identical points", () => {
    expect(haversineKm(TEL_AVIV, TEL_AVIV)).toBeCloseTo(0, 5);
  });

  it("Tel Aviv ↔ Jerusalem is ≈ 54 km (great-circle)", () => {
    const km = haversineKm(TEL_AVIV, JERUSALEM);
    expect(km).toBeGreaterThan(53.5);
    expect(km).toBeLessThan(54.6);
  });

  it("Tel Aviv ↔ Haifa is ≈ 81 km", () => {
    const km = haversineKm(TEL_AVIV, HAIFA);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(82);
  });

  it("is symmetric in its arguments (within 1e-9 km)", () => {
    const a = haversineKm(TEL_AVIV, JERUSALEM);
    const b = haversineKm(JERUSALEM, TEL_AVIV);
    expect(Math.abs(a - b)).toBeLessThan(1e-9);
  });

  it("equator special-case: 1° of longitude at lat 0 ≈ πR/180 km", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(km).toBeCloseTo((Math.PI * EARTH_RADIUS_KM) / 180, 1);
  });

  it("antipodal points return ≈ πR without NaN", () => {
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
