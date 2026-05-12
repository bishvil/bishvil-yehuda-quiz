import type { Feature, FeatureCollection, LineString } from "geojson";

import type { LatLng } from "@/src/components/map/map-types";

export function buildSegmentFeatureCollection(
  segments: Array<[LatLng, LatLng]>,
): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: segments.map<Feature<LineString>>(([a, b], i) => ({
      type: "Feature",
      id: i,
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
    })),
  };
}

export function buildHebrewLabelExpression(fallback: unknown): unknown[] {
  return [
    "coalesce",
    ["get", "name:he"],
    ["get", "name_he"],
    ["get", "name:he-Latn"],
    fallback,
    ["get", "name"],
  ];
}
