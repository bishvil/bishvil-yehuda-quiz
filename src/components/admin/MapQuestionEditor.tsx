"use client";

/**
 * Admin authoring UI for an interactive map question (ADR-0011 §10).
 *
 * Click-to-set-target, draggable target marker, log-scale tolerance
 * slider (0.1..500 km), and "use current view" capture button. The
 * integration tail wires this into `QuestionEditor.tsx` for questions whose
 * `type === 'map'`. The editor produces and consumes a `MapQuestionGeoDraft`
 * shape that maps 1:1 onto the additive `map.geo` block defined by
 * ADR-0011 §6.1.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type FormEvent } from "react";

import { MapQuestionDetails } from "@/src/components/admin/map/MapQuestionDetails";
import {
  MapSearchBox,
  type MapSearchStatus,
} from "@/src/components/admin/map/MapSearchBox";
import { MapToleranceControl } from "@/src/components/admin/map/MapToleranceControl";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  type InteractiveMarker,
  type LatLng,
  type MapStyleHint,
  type MapViewState,
} from "@/src/components/map/InteractiveMap";
import {
  searchMapPlaces,
  type PlaceSearchResult,
} from "@/src/lib/maps/place-search";

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
  styleHint?: MapStyleHint;
}

export const TOLERANCE_KM_MIN = 0.1;
export const TOLERANCE_KM_MAX = 500;

export interface MapQuestionEditorProps {
  value: MapQuestionGeoDraft | null;
  onChange: (next: MapQuestionGeoDraft) => void;
  className?: string;
}

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
  const [searchStatus, setSearchStatus] = useState<MapSearchStatus>("idle");
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
        const nextResults = await searchMapPlaces(query);
        setSearchResults(nextResults);
        setSearchStatus(nextResults.length > 0 ? "idle" : "empty");
      } catch {
        setSearchResults([]);
        setSearchStatus("error");
      }
    },
    [searchQuery],
  );

  const handleSearchQueryChange = useCallback((next: string) => {
    setSearchQuery(next);
    if (next.trim().length === 0) {
      setSearchResults([]);
      setSearchStatus("idle");
    }
  }, []);

  const handleDismissSearchResults = useCallback(() => {
    setSearchResults([]);
    setSearchStatus("idle");
  }, []);

  const handlePickSearchResult = useCallback(
    (result: PlaceSearchResult) => {
      const target = { lat: result.lat, lng: result.lng };
      onChange({ ...draft, target });
      setSearchQuery(result.name);
      setSearchResults([]);
      setSearchStatus("idle");
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
        className="relative flex h-[380px] w-full flex-col overflow-hidden rounded-md border border-bsy-stone-200 shadow-[0_1px_2px_rgba(74,63,38,0.06)] sm:h-[360px]"
        role="application"
        aria-label="עורך שאלת מפה — הקישו או גררו לסימון היעד"
      >
        <MapSearchBox
          query={searchQuery}
          results={searchResults}
          status={searchStatus}
          onQueryChange={handleSearchQueryChange}
          onSubmit={handleSearch}
          onSelectResult={handlePickSearchResult}
          onDismissResults={handleDismissSearchResults}
        />
        <div className="min-h-0 flex-1">
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
      </div>

      <MapQuestionDetails
        target={draft.target}
        center={draft.center}
        zoom={draft.zoom}
        onUseCurrentView={handleUseCurrentView}
        onResetView={handleResetView}
      />

      <MapToleranceControl
        minKm={TOLERANCE_KM_MIN}
        maxKm={TOLERANCE_KM_MAX}
        valueKm={draft.toleranceKm}
        sliderValue={sliderValue}
        onSliderChange={handleToleranceSlider}
        onTextChange={handleToleranceText}
      />
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
