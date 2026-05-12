"use client";

/**
 * Admin authoring UI for an interactive map question (ADR-0011 §10).
 *
 * Click-to-set-target, draggable target marker, log-scale tolerance
 * slider (0.1..500 km), "use current view" capture button. Self-contained
 * — the integration tail wires this into `QuestionEditor.tsx` for
 * questions whose `type === 'map'`. The editor produces and consumes a
 * `MapQuestionGeoDraft` shape that maps 1:1 onto the additive
 * `map.geo` block defined by ADR-0011 §6.1.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type FormEvent } from "react";

import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  type InteractiveMarker,
  type LatLng,
  type MapViewState,
} from "@/src/components/map/InteractiveMap";

const InteractiveMap = dynamic(
  () =>
    import("@/src/components/map/InteractiveMap").then((m) => m.InteractiveMap),
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

/** Editor draft — mirrors `map.geo` 1:1 plus a stable identity. */
export interface MapQuestionGeoDraft {
  target: LatLng;
  toleranceKm: number;
  center?: LatLng;
  zoom?: number;
  styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
}

export const TOLERANCE_KM_MIN = 0.1;
export const TOLERANCE_KM_MAX = 500;

export interface MapQuestionEditorProps {
  value: MapQuestionGeoDraft | null;
  onChange: (next: MapQuestionGeoDraft) => void;
  className?: string;
}

interface PlaceSearchResult {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const ADMIN_PLACE_LABELS: Array<{ name: string; position: LatLng }> = [
  { name: "ירושלים", position: { lat: 31.7683, lng: 35.2137 } },
  { name: "תל אביב", position: { lat: 32.0853, lng: 34.7818 } },
  { name: "חיפה", position: { lat: 32.794, lng: 34.9896 } },
  { name: "באר שבע", position: { lat: 31.2518, lng: 34.7913 } },
  { name: "אילת", position: { lat: 29.5577, lng: 34.9519 } },
  { name: "אשדוד", position: { lat: 31.8044, lng: 34.6553 } },
  { name: "אשקלון", position: { lat: 31.6688, lng: 34.5743 } },
  { name: "נתניה", position: { lat: 32.3215, lng: 34.8532 } },
  { name: "חדרה", position: { lat: 32.434, lng: 34.9196 } },
  { name: "טבריה", position: { lat: 32.7959, lng: 35.5309 } },
  { name: "צפת", position: { lat: 32.9646, lng: 35.496 } },
  { name: "נצרת", position: { lat: 32.6996, lng: 35.3035 } },
  { name: "עפולה", position: { lat: 32.6091, lng: 35.2892 } },
  { name: "בית שאן", position: { lat: 32.4973, lng: 35.4967 } },
  { name: "קריית שמונה", position: { lat: 33.2073, lng: 35.5708 } },
  { name: "מודיעין", position: { lat: 31.898, lng: 35.0104 } },
  { name: "אריאל", position: { lat: 32.1047, lng: 35.1733 } },
  { name: "גוש עציון", position: { lat: 31.6574, lng: 35.1235 } },
  { name: "חברון", position: { lat: 31.5326, lng: 35.0998 } },
  { name: "יריחו", position: { lat: 31.856, lng: 35.46 } },
];

/**
 * Default draft used when an admin first switches a question to the
 * geo-map type. Centered on Israel with a 5 km tolerance — a reasonable
 * radius for the field-event scale.
 */
export function defaultMapQuestionGeoDraft(): MapQuestionGeoDraft {
  return {
    target: { lat: MAP_DEFAULT_CENTER.lat, lng: MAP_DEFAULT_CENTER.lng },
    toleranceKm: 5,
    center: undefined,
    zoom: undefined,
    styleHint: undefined,
  };
}

export function MapQuestionEditor({
  value,
  onChange,
  className,
}: MapQuestionEditorProps) {
  const draft = value ?? defaultMapQuestionGeoDraft();
  const [view, setView] = useState<MapViewState>({
    latitude: draft.center?.lat ?? draft.target.lat,
    longitude: draft.center?.lng ?? draft.target.lng,
    zoom: draft.zoom ?? MAP_DEFAULT_ZOOM,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "loading" | "empty" | "error"
  >("idle");
  const [flyTo, setFlyTo] = useState<
    (Partial<MapViewState> & { durationMs?: number }) | undefined
  >(undefined);

  const initialView = useMemo(
    () => ({
      latitude: view.latitude,
      longitude: view.longitude,
      zoom: view.zoom,
    }),
    // Only pass the seed once; the InteractiveMap is uncontrolled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlePlace = useCallback(
    (next: LatLng) => onChange({ ...draft, target: next }),
    [draft, onChange],
  );

  const handleDragTarget = useCallback(
    (next: LatLng) => onChange({ ...draft, target: next }),
    [draft, onChange],
  );

  const handleUseCurrentView = useCallback(() => {
    onChange({
      ...draft,
      center: { lat: view.latitude, lng: view.longitude },
      zoom: Number(view.zoom.toFixed(2)),
    });
  }, [draft, onChange, view]);

  const handleResetView = useCallback(() => {
    const next = { ...draft };
    delete next.center;
    delete next.zoom;
    onChange(next);
  }, [draft, onChange]);

  const handleSearch = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = searchQuery.trim();
      if (query.length < 2) return;

      setSearchStatus("loading");
      try {
        const params = new URLSearchParams({
          format: "jsonv2",
          q: query,
          countrycodes: "il",
          limit: "6",
          bounded: "1",
          viewbox: "33.8,33.5,36.0,29.3",
          "accept-language": "he,en",
        });
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        );
        if (!response.ok) throw new Error("Place search failed");
        const rawResults = (await response.json()) as Array<{
          place_id?: number;
          osm_id?: number;
          display_name?: string;
          name?: string;
          lat?: string;
          lon?: string;
        }>;
        const nextResults = rawResults
          .map((result, index): PlaceSearchResult | null => {
            const lat = Number(result.lat);
            const lng = Number(result.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return {
              id: String(result.place_id ?? result.osm_id ?? index),
              name:
                result.name ??
                result.display_name?.split(",")[0]?.trim() ??
                "מיקום במפה",
              lat,
              lng,
            };
          })
          .filter((result): result is PlaceSearchResult => result !== null);

        setSearchResults(nextResults);
        setSearchStatus(nextResults.length > 0 ? "idle" : "empty");
      } catch {
        setSearchStatus("error");
      }
    },
    [searchQuery],
  );

  const handlePickSearchResult = useCallback(
    (result: PlaceSearchResult) => {
      const target = { lat: result.lat, lng: result.lng };
      onChange({ ...draft, target });
      setFlyTo({
        latitude: result.lat,
        longitude: result.lng,
        zoom: Math.max(view.zoom, 13),
        durationMs: 800,
      });
      setView((current) => ({
        ...current,
        latitude: result.lat,
        longitude: result.lng,
        zoom: Math.max(current.zoom, 13),
      }));
    },
    [draft, onChange, view.zoom],
  );

  const handleToleranceSlider = useCallback(
    (sliderValue: number) => {
      // Log-scale slider (0..1000) → km between TOLERANCE_KM_MIN and MAX.
      const km = sliderToKm(sliderValue);
      onChange({ ...draft, toleranceKm: km });
    },
    [draft, onChange],
  );

  const handleToleranceText = useCallback(
    (raw: string) => {
      const next = Number(raw);
      if (!Number.isFinite(next)) return;
      const clamped = Math.max(
        TOLERANCE_KM_MIN,
        Math.min(TOLERANCE_KM_MAX, next),
      );
      onChange({ ...draft, toleranceKm: clamped });
    },
    [draft, onChange],
  );

  const sliderValue = kmToSlider(draft.toleranceKm);

  const markers = useMemo<InteractiveMarker[]>(
    () => [
      ...ADMIN_PLACE_LABELS.map((place) => ({
        key: `label-${place.name}`,
        position: place.position,
        children: (
          <span className="pointer-events-none rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-bsy-ink shadow-[0_1px_3px_rgba(0,0,0,0.18)]">
            {place.name}
          </span>
        ),
      })),
      ...searchResults.map((result) => ({
        key: `search-${result.id}`,
        position: { lat: result.lat, lng: result.lng },
        color: "#c9822b",
        ariaLabel: result.name,
      })),
      {
        key: "target",
        position: draft.target,
        color: "#1f5135",
        draggable: true,
        onDragEnd: handleDragTarget,
        ariaLabel: "סמן היעד הנכון",
      },
    ],
    [draft.target, handleDragTarget, searchResults],
  );

  return (
    <div className={className ?? "flex flex-col gap-3"}>
      <div
        className="relative h-[320px] w-full overflow-hidden rounded-md border border-bsy-stone-200 shadow-[0_1px_2px_rgba(74,63,38,0.06)]"
        role="application"
        aria-label="עורך שאלת מפה — הקישו או גררו לסימון היעד"
      >
        <form
          onSubmit={handleSearch}
          className="absolute inset-x-3 top-3 z-10 flex gap-2 rounded-md border border-bsy-stone-200 bg-white/95 p-2 shadow-[0_2px_8px_rgba(74,63,38,0.12)]"
          dir="rtl"
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="חיפוש עיר, יישוב או אתר"
            className="min-w-0 flex-1 rounded-md border border-bsy-stone-200 px-3 py-1.5 text-[13px] text-bsy-ink outline-none focus:border-bsy-forest"
            aria-label="חיפוש מקום במפה"
          />
          <button
            type="submit"
            disabled={
              searchQuery.trim().length < 2 || searchStatus === "loading"
            }
            className="rounded-md bg-bsy-forest px-3 py-1.5 text-[12px] font-bold text-bsy-paper disabled:cursor-not-allowed disabled:bg-bsy-stone-300"
          >
            {searchStatus === "loading" ? "מחפש..." : "חיפוש"}
          </button>
        </form>
        {searchResults.length > 0 ||
        searchStatus === "empty" ||
        searchStatus === "error" ? (
          <div
            className="absolute inset-x-3 top-[58px] z-10 rounded-md border border-bsy-stone-200 bg-white/95 p-1.5 text-[12px] shadow-[0_2px_8px_rgba(74,63,38,0.12)]"
            dir="rtl"
          >
            {searchStatus === "empty" ? (
              <p className="m-0 px-2 py-1.5 text-bsy-stone-700">
                לא נמצאו תוצאות.
              </p>
            ) : null}
            {searchStatus === "error" ? (
              <p className="m-0 px-2 py-1.5 text-bsy-error">
                החיפוש נכשל. נסו שוב.
              </p>
            ) : null}
            {searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => handlePickSearchResult(result)}
                className="block w-full rounded px-2 py-1.5 text-right text-bsy-ink hover:bg-bsy-paper-warm"
              >
                {result.name}
              </button>
            ))}
          </div>
        ) : null}
        <InteractiveMap
          initialView={initialView}
          styleHint={draft.styleHint}
          onMapClick={handlePlace}
          onMove={setView}
          showLabels
          flyTo={flyTo}
          isAdmin
          markers={markers}
          ariaLabel="עורך שאלת מפה"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2">
          <div className="font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            יעד (lat / lng)
          </div>
          <div className="font-mono text-[13px] text-bsy-ink" dir="ltr">
            {draft.target.lat.toFixed(5)}, {draft.target.lng.toFixed(5)}
          </div>
        </div>
        <div className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2">
          <div className="font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            ברירת מחדל לתצוגה
          </div>
          <div className="flex items-center justify-between gap-2">
            {draft.center && draft.zoom !== undefined ? (
              <span className="font-mono text-[13px] text-bsy-ink" dir="ltr">
                {draft.center.lat.toFixed(2)}, {draft.center.lng.toFixed(2)} @{" "}
                {draft.zoom}
              </span>
            ) : (
              <span className="text-bsy-stone-400">ברירת מחדל ארצית</span>
            )}
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded-md border border-bsy-stone-200 px-2 py-1 text-[11px] hover:border-bsy-forest"
                onClick={handleUseCurrentView}
              >
                השתמש במבט הנוכחי
              </button>
              {draft.center ? (
                <button
                  type="button"
                  className="rounded-md border border-bsy-stone-200 px-2 py-1 text-[11px] text-bsy-stone-700 hover:border-bsy-error hover:text-bsy-error"
                  onClick={handleResetView}
                >
                  איפוס
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          רדיוס סובלנות (ק״מ)
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={sliderValue}
            onChange={(e) => handleToleranceSlider(Number(e.target.value))}
            aria-label="רדיוס סובלנות בק״מ"
            className="flex-1 accent-bsy-forest"
          />
          <input
            type="number"
            min={TOLERANCE_KM_MIN}
            max={TOLERANCE_KM_MAX}
            step={0.1}
            value={Number(draft.toleranceKm.toFixed(2))}
            onChange={(e) => handleToleranceText(e.target.value)}
            className="w-24 rounded-md border border-bsy-stone-200 bg-white px-2 py-1 font-mono text-[13px]"
            aria-label="רדיוס סובלנות בק״מ — קלט טקסטואלי"
          />
        </div>
        <span className="text-[11px] text-bsy-stone-400">
          סולם לוגריתמי בין {TOLERANCE_KM_MIN} ל־{TOLERANCE_KM_MAX} ק״מ.
        </span>
      </label>
    </div>
  );
}

/**
 * Slider domain `[0..1000]` → km on a log scale between MIN..MAX. Pure
 * function so unit tests can exercise it directly.
 */
export function sliderToKm(slider: number): number {
  const clamped = Math.max(0, Math.min(1000, slider));
  const ratio = clamped / 1000;
  const minLog = Math.log(TOLERANCE_KM_MIN);
  const maxLog = Math.log(TOLERANCE_KM_MAX);
  return Math.exp(minLog + ratio * (maxLog - minLog));
}

/** Inverse of `sliderToKm`. */
export function kmToSlider(km: number): number {
  const clamped = Math.max(TOLERANCE_KM_MIN, Math.min(TOLERANCE_KM_MAX, km));
  const minLog = Math.log(TOLERANCE_KM_MIN);
  const maxLog = Math.log(TOLERANCE_KM_MAX);
  const ratio = (Math.log(clamped) - minLog) / (maxLog - minLog);
  return Math.round(ratio * 1000);
}
