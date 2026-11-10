import type { FeatureCollection, Polygon } from "geojson";
import type { LatLng } from "@/src/lib/scoring";

/** Geodesic preview only; the server still decides whether a GPS fix is in range. */
export function buildRadiusArea(
  center: LatLng,
  radiusM: number,
): FeatureCollection<Polygon> {
  if (
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng) ||
    Math.abs(center.lat) > 90 ||
    Math.abs(center.lng) > 180 ||
    !Number.isFinite(radiusM) ||
    radiusM <= 0
  ) {
    return { type: "FeatureCollection", features: [] };
  }
  const latitude = (center.lat * Math.PI) / 180;
  const longitude = (center.lng * Math.PI) / 180;
  const angle = radiusM / 6_371_000;
  const coordinates: number[][] = [];
  for (let step = 0; step < 72; step++) {
    const bearing = (2 * Math.PI * step) / 72;
    const lat = Math.asin(
      Math.sin(latitude) * Math.cos(angle) +
        Math.cos(latitude) * Math.sin(angle) * Math.cos(bearing),
    );
    const lng =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angle) * Math.cos(latitude),
        Math.cos(angle) - Math.sin(latitude) * Math.sin(lat),
      );
    coordinates.push([
      (((lng * 180) / Math.PI + 540) % 360) - 180,
      (lat * 180) / Math.PI,
    ]);
  }
  coordinates.push([...coordinates[0]!]);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coordinates] },
      },
    ],
  };
}
