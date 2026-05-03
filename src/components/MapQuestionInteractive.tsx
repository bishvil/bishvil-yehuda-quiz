"use client";

/**
 * Participant view of a map question backed by an interactive MapLibre map
 * (ADR-0011). Self-contained — the integration tail wires this into
 * `app/[pin]/play/play-screen.tsx` in place of the legacy
 * `MapQuestion` component for questions whose `map.geo` block is set.
 *
 * Wire-up contract (consumed by the integration brief):
 *
 *   <MapQuestionInteractive
 *     geo={questionGeoMeta}                  // map.geo (MINUS the target)
 *     pin={mapPin /* {lat,lng} | null *\/ }
 *     onPin={(p) => setMapPin(p)}
 *     revealed={isRevealed}
 *     target={isRevealed ? revealedGeoTarget : null}
 *     toleranceKm={questionGeoMeta.toleranceKm}
 *   />
 *
 * Per ADR-0008, `target` is omitted from the participant payload before
 * reveal; the integration tail must pass `null` until reveal even if it
 * has the value server-side.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";

import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  type InteractiveMarker,
  type LatLng,
} from "@/src/components/map/InteractiveMap";

const InteractiveMap = dynamic(
  () => import("@/src/components/map/InteractiveMap").then((m) => m.InteractiveMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-full w-full items-center justify-center rounded-md border border-bsy-stone-200 bg-bsy-paper-warm text-sm text-bsy-stone-700"
        aria-live="polite"
      >
        טוען מפה...
      </div>
    ),
  },
);

/** Public-safe slice of `map.geo` — the target is intentionally absent. */
export interface MapQuestionGeoMeta {
  center?: LatLng;
  zoom?: number;
  toleranceKm: number;
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
}

export interface MapQuestionInteractiveProps {
  geo: MapQuestionGeoMeta;
  /** Participant's current pin, or null while unset. Owned by the parent. */
  pin: LatLng | null;
  onPin: (next: LatLng) => void;
  revealed: boolean;
  /** Target lat/lng — pass null until `revealed === true` (ADR-0008 §2). */
  target: LatLng | null;
  /**
   * Hide the click handler when the answer has been submitted but the
   * question is not yet revealed (sync mode, ADR-0006 §8).
   */
  locked?: boolean;
  /** Optional override for the default H≈360px container. */
  className?: string;
}

export function MapQuestionInteractive({
  geo,
  pin,
  onPin,
  revealed,
  target,
  locked,
  className,
}: MapQuestionInteractiveProps) {
  const initialView = useMemo(
    () => ({
      latitude: geo.center?.lat ?? MAP_DEFAULT_CENTER.lat,
      longitude: geo.center?.lng ?? MAP_DEFAULT_CENTER.lng,
      zoom: geo.zoom ?? MAP_DEFAULT_ZOOM,
    }),
    [geo.center?.lat, geo.center?.lng, geo.zoom],
  );

  const distanceKm =
    revealed && pin && target ? haversineKmInline(pin, target) : null;
  const isCorrect =
    distanceKm !== null ? distanceKm <= geo.toleranceKm : null;

  const markers = useMemo(() => {
    const list: InteractiveMarker[] = [];
    if (pin) {
      list.push({
        key: "user-pin",
        position: pin,
        color: revealed ? (isCorrect ? "#1f5135" : "#a23b3b") : "#a23b3b",
        ariaLabel: revealed
          ? isCorrect
            ? "סימון נכון"
            : "סימון לא מדויק"
          : "הסימון שלך",
      });
    }
    if (revealed && target) {
      list.push({
        key: "target",
        position: target,
        color: "#1f5135",
        ariaLabel: "המיקום הנכון",
      });
    }
    return list;
  }, [pin, revealed, isCorrect, target]);

  const segments = useMemo<Array<[LatLng, LatLng]>>(() => {
    if (revealed && pin && target) {
      return [[pin, target]];
    }
    return [];
  }, [revealed, pin, target]);

  const lockedNotRevealed = Boolean(locked) && !revealed;

  const helpText = revealed
    ? isCorrect
      ? `הסימון נחשף. המרחק: ${formatKm(distanceKm)} ק״מ.`
      : `הסימון נחשף. המרחק: ${formatKm(distanceKm)} ק״מ (סובלנות ${formatKm(geo.toleranceKm)} ק״מ).`
    : lockedNotRevealed
      ? "התחנה ננעלה — הזמן הסתיים."
      : pin
        ? "אפשר עוד להזיז — הקישו על מקום אחר."
        : "הקישו על המפה במקום שאתם חושבים שמיקום היעד.";

  const interactionDisabled = Boolean(locked) || revealed;

  return (
    <div className={className ?? "flex flex-col gap-2"}>
      <div
        className="relative h-[360px] w-full overflow-hidden rounded-md border border-bsy-stone-100 shadow-[0_1px_2px_rgba(74,63,38,0.06)]"
        role="application"
        aria-label="מפת תשובה — הקישו לסימון מיקום"
        style={
          lockedNotRevealed
            ? { filter: "grayscale(0.55)", cursor: "not-allowed" }
            : undefined
        }
      >
        <InteractiveMap
          initialView={initialView}
          styleHint={geo.styleHint}
          onMapClick={interactionDisabled ? undefined : onPin}
          markers={markers}
          segments={segments}
          disabled={interactionDisabled}
          ariaLabel="מפת תשובה — הקישו לסימון מיקום"
        />
        {lockedNotRevealed ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-2 top-2 rounded-md border border-bsy-stone-300 bg-white/85 px-3 py-1.5 text-center text-[12px] font-bold text-bsy-stone-700 shadow-[0_1px_2px_rgba(74,63,38,0.06)]"
          >
            התחנה ננעלה — הזמן הסתיים.
          </div>
        ) : null}
      </div>
      <p className="px-1.5 text-center text-xs text-bsy-stone-700">{helpText}</p>
    </div>
  );
}

/**
 * Inline haversine to keep this component self-contained (no scoring import
 * needed for the reveal display). The authoritative scoring lives server
 * side per ADR-0006 — this is purely for the participant's "you are X km
 * away" reveal text and matches the server's formula bit-for-bit.
 */
function haversineKmInline(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatKm(km: number | null): string {
  if (km === null) return "—";
  if (km < 1) return km.toFixed(2);
  if (km < 10) return km.toFixed(1);
  return Math.round(km).toLocaleString("he-IL");
}
