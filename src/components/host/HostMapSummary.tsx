"use client";

import dynamic from "next/dynamic";

import type { InteractiveMarker } from "@/src/components/map/InteractiveMap";
import { formatKm } from "@/src/lib/format/distance";

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

export interface HostParticipantPin {
  participantId: string;
  lat: number;
  lng: number;
  /** null pre-reveal (answer leakage guard per ADR-0008 §2). */
  isCorrect: boolean | null;
  /** null pre-reveal. */
  distanceKm: number | null;
  /**
   * 0..1 correctness ratio from the partial-credit formula.
   * Null pre-reveal.
   * ADR-0006 Open Q2 RESOLVED.
   */
  correctnessRatio?: number | null;
}

interface HostMapSummaryProps {
  geo: HostMapSummaryGeoMeta | null;
  /** Reveal-only geo target coordinates (lat/lng). */
  geoTarget: { lat: number; lng: number } | null;
  isRevealed: boolean;
  /** Participant geo pins for the host guide view (Part D). */
  participantPins?: HostParticipantPin[] | null;
}

export function HostMapSummary({
  geo,
  geoTarget,
  isRevealed,
  participantPins,
}: HostMapSummaryProps) {
  if (!geo) {
    return (
      <div className="rounded-md border border-bsy-error/30 bg-bsy-error/10 p-3 text-center text-sm text-bsy-error">
        מפת השאלה חסרה. צרו קשר עם המארגנים.
      </div>
    );
  }

  const markers: InteractiveMarker[] = [];

  if (participantPins) {
    for (const pin of participantPins) {
      let color: string;
      if (!isRevealed || pin.isCorrect === null) {
        color = "#9ca3af";
      } else {
        color = pin.isCorrect ? "#16a34a" : "#dc2626";
      }
      markers.push({
        key: `participant-${pin.participantId}`,
        position: { lat: pin.lat, lng: pin.lng },
        color,
        ariaLabel: isRevealed
          ? pin.isCorrect
            ? "תשובה נכונה"
            : "תשובה שגויה"
          : "תשובת משתתף",
      });
    }
  }

  if (isRevealed && geoTarget) {
    markers.push({
      key: "host-target",
      position: geoTarget,
      color: "#1f5135",
      ariaLabel: "המיקום הנכון",
    });
  }

  const revealStats = (() => {
    if (!isRevealed || !participantPins || participantPins.length === 0) return null;
    const ratios = participantPins
      .map((p) => p.correctnessRatio)
      .filter((r): r is number => r != null);
    const distances = participantPins
      .map((p) => p.distanceKm)
      .filter((d): d is number => d != null);
    if (ratios.length === 0) return null;
    const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const avgDist =
      distances.length > 0
        ? distances.reduce((s, d) => s + d, 0) / distances.length
        : null;
    return { avgRatio, avgDist };
  })();

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
          ? revealStats
            ? `הסימון נחשף — סובלנות ${geo.toleranceKm} ק״מ · ממוצע דיוק ${Math.round(revealStats.avgRatio * 100)}%${revealStats.avgDist != null ? ` · ממוצע מרחק ${formatKm(revealStats.avgDist)} ק״מ` : ""}`
            : `הסימון נחשף — סובלנות ${geo.toleranceKm} ק״מ.`
          : `שאלת מפה גיאוגרפית. סובלנות: ${geo.toleranceKm} ק״מ. לחיצה על ׳חשיפת התשובה׳ תציג את היעד.`}
      </p>
    </div>
  );
}

