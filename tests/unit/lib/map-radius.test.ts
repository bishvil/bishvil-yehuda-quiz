import { describe, expect, it } from "vitest";
import { buildRadiusArea } from "@/src/lib/maps/radius";
import { haversineKm } from "@/src/lib/scoring";

describe("geographic radius preview", () => {
  it("closes a polygon at the configured distance from an Israeli station", () => {
    const center = { lat: 31.7767, lng: 35.2345 };
    const feature = buildRadiusArea(center, 100).features[0]!;
    const points = feature.geometry.coordinates[0]!;
    expect(points[0]).toEqual(points.at(-1));
    for (const point of points)
      expect(
        haversineKm(center, { lng: point[0]!, lat: point[1]! }) * 1000,
      ).toBeCloseTo(100, 3);
  });
  it("keeps a circle valid when crossing the longitude seam", () => {
    const points = buildRadiusArea({ lat: 0, lng: 179.9999 }, 1000).features[0]!
      .geometry.coordinates[0]!;
    expect(points.every(([lng]) => lng! >= -180 && lng! <= 180)).toBe(true);
  });
  it("omits invalid previews instead of crashing the editor", () => {
    expect(buildRadiusArea({ lat: Number.NaN, lng: 35 }, 100).features).toEqual(
      [],
    );
    expect(buildRadiusArea({ lat: 31, lng: 35 }, 0).features).toEqual([]);
  });
});
