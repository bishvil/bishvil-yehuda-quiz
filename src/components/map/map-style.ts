import type { StyleSpecification } from "maplibre-gl";

import type { MapStyleHint } from "@/src/components/map/map-types";

/** ADR-0011 §3 default IL viewport. */
export const MAP_DEFAULT_CENTER = { lat: 31.5, lng: 34.9 } as const;
export const MAP_DEFAULT_ZOOM = 7;

/**
 * Camera is locked to Israel + a small buffer so participants can't pan to
 * other countries. Bounds are [west, south, east, north] in WGS-84 degrees.
 */
export const MAP_ISRAEL_BOUNDS: [number, number, number, number] = [
  33.8, 29.3, 36.0, 33.5,
];
export const MAP_MIN_ZOOM = 6.5;
export const MAP_MAX_ZOOM = 17;

/** RTL plugin URL — mirrors Mapbox's plugin protocol byte-for-byte. */
export const MAP_RTL_TEXT_PLUGIN_URL =
  "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js";

/**
 * Resolve the single MapLibre style used by the map question.
 *
 * Existing questions default to satellite imagery. Streets and configurable
 * settlement labels use MapTiler streets or the keyless OpenFreeMap vector style.
 * The map wrapper overlays imagery when satellite and labels are both selected.
 */
export function resolveStyle(
  styleHint?: MapStyleHint,
  baseStyle: "satellite" | "streets" = "satellite",
  labelLevel: string = "none",
): string | StyleSpecification {
  void styleHint;
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  if (baseStyle === "streets" || labelLevel !== "none") {
    return key
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
      : "https://tiles.openfreemap.org/styles/liberty";
  }
  if (key) {
    return `https://api.maptiler.com/maps/satellite/style.json?key=${encodeURIComponent(key)}`;
  }

  return {
    version: 8,
    sources: {
      "esri-world-imagery": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution:
          'Tiles © <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: "esri-world-imagery-layer",
        type: "raster",
        source: "esri-world-imagery",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

/**
 * @deprecated Use `resolveStyle` which returns `string | StyleSpecification`.
 */
export function resolveStyleUrl(styleHint?: MapStyleHint): string {
  const result = resolveStyle(styleHint);
  if (typeof result === "string") return result;
  return "https://demotiles.maplibre.org/style.json";
}
