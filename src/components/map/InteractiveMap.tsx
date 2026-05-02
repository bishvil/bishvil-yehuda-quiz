"use client";

/**
 * Shared MapLibre wrapper for the interactive map question (ADR-0011).
 *
 * Notes for future maintainers:
 * - This module instantiates a WebGL context on mount via `maplibre-gl`. It
 *   MUST only be reached through `next/dynamic({ ssr: false })`. The
 *   `MapQuestionInteractive`, `MapQuestionEditor`, and `app/dev/map-preview`
 *   consumers all dynamic-import this file. Direct imports will break the
 *   Next 16 production build.
 * - `react-map-gl` v8 ships separate Mapbox / MapLibre subpaths. We import
 *   exclusively from `react-map-gl/maplibre` so that no `mapbox-gl`
 *   dependency is bundled.
 * - The MapLibre style file `maplibre-gl/dist/maplibre-gl.css` is imported
 *   here so that App Router code-splits the CSS together with this module
 *   (the CSS only ships on routes that hydrate the map).
 * - `RTLTextPlugin` is mandatory for Hebrew labels (ADR-0011 §2). It is
 *   passed as a top-level Map prop; `react-map-gl` calls
 *   `maplibregl.setRTLTextPlugin(url, errorCallback, lazy=true)` exactly
 *   once per page.
 * - `dragRotate={false}` removes a confusing two-finger gesture without
 *   sacrificing pinch-to-zoom (`touchZoomRotate` and `touchPitch` remain on
 *   their MapLibre defaults).
 */

import "maplibre-gl/dist/maplibre-gl.css";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Layer,
  Map,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString } from "geojson";

/** ADR-0011 §3 default IL viewport. */
export const MAP_DEFAULT_CENTER = { lat: 31.5, lng: 34.9 } as const;
export const MAP_DEFAULT_ZOOM = 7;

/** Geographic coordinate. WGS-84 degrees. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Subset of the `react-map-gl` view-state shape we control. */
export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

/** RTL plugin URL — mirrors Mapbox's plugin protocol byte-for-byte. */
export const MAP_RTL_TEXT_PLUGIN_URL =
  "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js";

/**
 * Resolve the MapLibre style for a given hint.
 *
 * Per ADR-0011 §1, MapTiler is the primary tile source via a public env
 * var. Without a key each hint falls back to a DISTINCT free public style
 * so that the style-switch UI is meaningful even in development:
 *
 *   maptiler-streets  → OpenFreeMap Liberty   (vector, no key needed)
 *   osm-liberty       → OpenFreeMap Positron  (vector, no key needed)
 *   israel-hiking     → OpenTopoMap raster    (inline StyleSpecification)
 *
 * For `israel-hiking` the return value is a full StyleSpecification object
 * so that no external JSON fetch is required and the raster tiles are
 * served directly — callers must accept `string | StyleSpecification`.
 */
export function resolveStyle(
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty",
): string | StyleSpecification {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  if (styleHint === "israel-hiking") {
    // Inline raster style — no key required. Uses OpenTopoMap tiles which
    // include topographic detail and Hebrew-readable place names.
    const israelHikingStyle: StyleSpecification = {
      version: 8,
      sources: {
        "opentopomap-raster": {
          type: "raster",
          tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '© <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
          maxzoom: 17,
        },
      },
      layers: [
        {
          id: "opentopomap-layer",
          type: "raster",
          source: "opentopomap-raster",
          minzoom: 0,
          maxzoom: 22,
        },
      ],
    };
    return israelHikingStyle;
  }

  if (styleHint === "osm-liberty") {
    if (key) {
      return `https://api.maptiler.com/maps/openstreetmap/style.json?key=${encodeURIComponent(key)}`;
    }
    // Free fallback: OpenFreeMap Positron — visually distinct from Liberty.
    return "https://tiles.openfreemap.org/styles/positron";
  }

  // Default / maptiler-streets
  if (key) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`;
  }
  // Free fallback: OpenFreeMap Liberty — no key required.
  return "https://tiles.openfreemap.org/styles/liberty";
}

/**
 * @deprecated Use `resolveStyle` which returns `string | StyleSpecification`.
 * This shim exists only for callers that still expect a plain string URL.
 */
export function resolveStyleUrl(
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty",
): string {
  const result = resolveStyle(styleHint);
  if (typeof result === "string") return result;
  // israel-hiking inline style — fall back to demotiles string for
  // legacy callers that cannot handle an object.
  return "https://demotiles.maplibre.org/style.json";
}

/** A marker rendered on the map. */
export interface InteractiveMarker {
  /** Stable React key. */
  key: string;
  position: LatLng;
  /** CSS color string for the default pin glyph (ignored if `children` set). */
  color?: string;
  /** Allow drag (admin: target marker). */
  draggable?: boolean;
  onDragEnd?: (next: LatLng) => void;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  /** Custom marker content; falls back to a built-in dot when omitted. */
  children?: ReactNode;
}

export interface InteractiveMapProps {
  /** Initial camera (uncontrolled). */
  initialView?: Partial<MapViewState>;
  /** Style hint per ADR-0011 §6.1. */
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
  /** Click handler — receives WGS-84 lat/lng. Disabled when `disabled` true. */
  onMapClick?: (point: LatLng) => void;
  /** Stable list of markers; placement order does not matter. */
  markers?: InteractiveMarker[];
  /** Optional dashed line segments (used by reveal). Each entry is [from, to]. */
  segments?: Array<[LatLng, LatLng]>;
  /** When true, click handlers are no-ops (post-submission lock). */
  disabled?: boolean;
  /** Show the +/- zoom + compass buttons. Default true. */
  showNavigation?: boolean;
  /** Wrapper styles. The map fills its container. */
  style?: CSSProperties;
  /** ARIA label for the application region. */
  ariaLabel?: string;
  /** Camera move callback (e.g. for an editor's "use current view" button). */
  onMove?: (view: MapViewState) => void;
  /** Set true if the consumer wants to read the underlying MapLibre instance. */
  exposeRef?: boolean;
  /**
   * When true and `NEXT_PUBLIC_MAPTILER_KEY` is absent, a Hebrew warning
   * banner is shown above the map prompting the admin to configure the key.
   * Should only be passed as `true` from admin surfaces.
   */
  isAdmin?: boolean;
}

export interface InteractiveMapHandle {
  /** Returns the underlying `maplibregl.Map` if mounted, else null. */
  getMap(): ReturnType<MapRef["getMap"]> | null;
}

/**
 * Click → LatLng adapter. `react-map-gl@8` exposes `event.lngLat.lng/lat` on
 * `MapLayerMouseEvent`; we copy into a plain object so consumers don't have
 * to depend on the library's own `LngLat` class.
 */
function lngLatFromClick(event: MapLayerMouseEvent): LatLng {
  return { lat: event.lngLat.lat, lng: event.lngLat.lng };
}

const DefaultMarker = ({ color }: { color: string }) => (
  <span
    aria-hidden="true"
    style={{
      display: "inline-block",
      width: 18,
      height: 18,
      borderRadius: "50% 50% 50% 0",
      transform: "rotate(-45deg)",
      backgroundColor: color,
      border: "2px solid white",
      boxShadow: "0 4px 8px rgba(0,0,0,0.25)",
    }}
  />
);

const InteractiveMapImpl = forwardRef<InteractiveMapHandle, InteractiveMapProps>(
  function InteractiveMapImpl(props, ref) {
    const mapRef = useRef<MapRef | null>(null);

    useImperativeHandle(
      ref,
      (): InteractiveMapHandle => ({
        getMap: () => mapRef.current?.getMap() ?? null,
      }),
      [],
    );

    const initialViewState = useMemo<MapViewState>(() => {
      const center = props.initialView?.latitude ?? MAP_DEFAULT_CENTER.lat;
      const lng = props.initialView?.longitude ?? MAP_DEFAULT_CENTER.lng;
      const zoom = props.initialView?.zoom ?? MAP_DEFAULT_ZOOM;
      return { longitude: lng, latitude: center, zoom };
    }, [props.initialView?.latitude, props.initialView?.longitude, props.initialView?.zoom]);

    const mapStyle = useMemo(() => resolveStyle(props.styleHint), [props.styleHint]);

    const showMaptilerWarning =
      props.isAdmin === true && !process.env.NEXT_PUBLIC_MAPTILER_KEY;

    const handleClick = useCallback(
      (event: MapLayerMouseEvent) => {
        if (props.disabled || !props.onMapClick) return;
        props.onMapClick(lngLatFromClick(event));
      },
      [props],
    );

    const handleMove = useCallback(
      (event: ViewStateChangeEvent) => {
        if (!props.onMove) return;
        const v = event.viewState;
        props.onMove({ longitude: v.longitude, latitude: v.latitude, zoom: v.zoom });
      },
      [props],
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", ...props.style }}>
        {showMaptilerWarning ? (
          <div
            role="alert"
            dir="rtl"
            style={{
              backgroundColor: "#fef9c3",
              borderBottom: "1px solid #fde047",
              padding: "6px 12px",
              fontSize: 12,
              color: "#713f12",
              flexShrink: 0,
            }}
          >
            מפת לוויין מקוצרת — הוסף NEXT_PUBLIC_MAPTILER_KEY לקבלת איכות מלאה
          </div>
        ) : null}
        <Map
          ref={mapRef}
          reuseMaps
          initialViewState={initialViewState}
          mapStyle={mapStyle}
          RTLTextPlugin={MAP_RTL_TEXT_PLUGIN_URL}
          dragRotate={false}
          attributionControl={{ compact: true }}
          onClick={handleClick}
          onMove={props.onMove ? handleMove : undefined}
          style={{ width: "100%", flex: 1 }}
          aria-label={props.ariaLabel}
        >
        {props.showNavigation !== false ? (
          <NavigationControl position="top-left" showCompass={false} />
        ) : null}

        {(props.markers ?? []).map((marker) => (
          <Marker
            key={marker.key}
            longitude={marker.position.lng}
            latitude={marker.position.lat}
            anchor="bottom"
            draggable={marker.draggable}
            onDragEnd={
              marker.draggable && marker.onDragEnd
                ? (e) => marker.onDragEnd?.({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                : undefined
            }
          >
            {marker.children ?? (
              <DefaultMarker color={marker.color ?? "#a23b3b"} />
            )}
          </Marker>
        ))}

        {props.segments && props.segments.length > 0 ? (
          <Source
            id="bsy-reveal-segments"
            type="geojson"
            data={buildSegmentFeatureCollection(props.segments)}
          >
            <Layer
              id="bsy-reveal-segments-line"
              type="line"
              paint={{
                "line-color": "#1f5135",
                "line-width": 3,
                "line-dasharray": [2, 1],
              }}
            />
          </Source>
        ) : null}
      </Map>
      </div>
    );
  },
);

function buildSegmentFeatureCollection(
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

export const InteractiveMap = InteractiveMapImpl;
