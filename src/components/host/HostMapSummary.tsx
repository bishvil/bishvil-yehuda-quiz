"use client";

import dynamic from "next/dynamic";

import type { InteractiveMarker } from "@/src/components/map/InteractiveMap";

const InteractiveMap = dynamic(
  () => import("@/src/components/map/InteractiveMap").then((m) => m.InteractiveMap),
  { ssr: false },
);

interface HostMapSummaryGeoMeta {
  center?: { lat: number; lng: number };
  zoom?: number;
  toleranceKm: number;
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
}

interface HostMapSummaryProps {
  /** Legacy raster image URL — null for geo questions. */
  imageUrl: string | null;
  /** Geo block — null for legacy raster questions. */
  geo: HostMapSummaryGeoMeta | null;
  /** Reveal-only legacy target coordinates (% of image, 0-100). */
  target: { x: number; y: number } | null;
  /** Reveal-only geo target coordinates (lat/lng). */
  geoTarget: { lat: number; lng: number } | null;
  toleranceRadiusPercent: number | null;
  isRevealed: boolean;
}

export function HostMapSummary({
  imageUrl,
  geo,
  target,
  geoTarget,
  toleranceRadiusPercent,
  isRevealed,
}: HostMapSummaryProps) {
  if (geo) {
    return (
      <GeoMapSummary geo={geo} geoTarget={geoTarget} isRevealed={isRevealed} />
    );
  }

  if (!imageUrl) {
    return (
      <div className="rounded-md border border-bsy-error/30 bg-bsy-error/10 p-3 text-center text-sm text-bsy-error">
        מפת השאלה חסרה. צרו קשר עם המארגנים.
      </div>
    );
  }

  const radius = toleranceRadiusPercent ?? 8;

  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-3">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-bsy-paper-warm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {isRevealed && target ? (
          <>
            <div
              aria-hidden="true"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bsy-forest bg-bsy-forest/15"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${radius * 2}%`,
                aspectRatio: "1 / 1",
              }}
            />
            <div
              aria-hidden="true"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-bsy-forest"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: 14,
                height: 14,
              }}
            />
          </>
        ) : null}
      </div>
      <p className="mt-2 text-center text-[12px] text-bsy-stone-700">
        {isRevealed
          ? "התשובה הנכונה נחשפה — הסימון מציג את היעד ואת רדיוס הסובלנות."
          : "לחיצה על ׳חשיפת התשובה׳ תציג את היעד והסובלנות לכל המשתתפים."}
      </p>
    </div>
  );
}

function GeoMapSummary({
  geo,
  geoTarget,
  isRevealed,
}: {
  geo: HostMapSummaryGeoMeta;
  geoTarget: { lat: number; lng: number } | null;
  isRevealed: boolean;
}) {
  const markers: InteractiveMarker[] =
    isRevealed && geoTarget
      ? [
          {
            key: "host-target",
            position: geoTarget,
            color: "#1f5135",
            ariaLabel: "המיקום הנכון",
          },
        ]
      : [];

  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-3">
      <div className="relative h-[280px] w-full overflow-hidden rounded-md">
        <InteractiveMap
          initialView={{
            latitude: geo.center?.lat,
            longitude: geo.center?.lng,
            zoom: geo.zoom,
          }}
          styleHint={geo.styleHint}
          markers={markers}
          disabled
          ariaLabel="מפת שאלה — תצוגת מארח"
        />
      </div>
      <p className="mt-2 text-center text-[12px] text-bsy-stone-700">
        {isRevealed
          ? `הסימון נחשף — סובלנות ${geo.toleranceKm} ק״מ.`
          : `שאלת מפה גיאוגרפית. סובלנות: ${geo.toleranceKm} ק״מ. לחיצה על ׳חשיפת התשובה׳ תציג את היעד.`}
      </p>
    </div>
  );
}
