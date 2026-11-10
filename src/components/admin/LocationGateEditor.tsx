"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";
import type { LocationGate } from "@/src/lib/schemas/question-settings";
import {
  searchMapPlaces,
  type PlaceSearchResult,
} from "@/src/lib/maps/place-search";
import { MapSearchBox, type MapSearchStatus } from "./map/MapSearchBox";
import type { MapViewState } from "@/src/components/map/map-types";

const InteractiveMap = dynamic(
  () =>
    import("@/src/components/map/InteractiveMap").then((m) => m.InteractiveMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-full items-center justify-center bg-bsy-paper-warm text-sm"
        role="status"
      >
        טוען מפה… אפשר גם לחפש מקום או להזין קואורדינטות.
      </div>
    ),
  },
);

const inputClass =
  "mt-1 min-h-11 w-full rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-sm text-bsy-ink focus:border-bsy-forest focus:outline-none disabled:bg-bsy-stone-50";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-bsy-stone-200 bg-white px-4 py-2 text-sm font-bold text-bsy-forest hover:border-bsy-forest disabled:cursor-not-allowed disabled:text-bsy-stone-400";

export function LocationGateEditor({
  question,
  update,
  readOnly,
}: {
  question: EditableQuestion;
  update: (patch: Partial<EditableQuestion>) => void;
  readOnly: boolean;
}) {
  const gate = question.settings?.locationGate;
  const [choosing, setChoosing] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState(100);
  const [coordinateDraft, setCoordinateDraft] = useState({
    lat: gate ? String(gate.lat) : "",
    lng: gate ? String(gate.lng) : "",
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<MapSearchStatus>("idle");
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<
    (Partial<MapViewState> & { durationMs?: number }) | undefined
  >();
  const mounted = useRef(true);
  const searchVersion = useRef(0);
  const locationVersion = useRef(0);
  const latestPlace = useRef(place);
  useEffect(() => {
    latestPlace.current = place;
  });
  const radiusId = useId();
  const enabled =
    Boolean(gate) || choosing || question.locationGatePending === true;
  const radius = gate?.radiusM ?? radiusDraft;
  useEffect(() => {
    mounted.current = true;
    searchVersion.current++;
    locationVersion.current++;
    return () => {
      mounted.current = false;
    };
  }, []);

  function place(point: { lat: number; lng: number }) {
    if (readOnly) return;
    // A deliberate map/search choice supersedes any pending device lookup.
    locationVersion.current++;
    setLocationBusy(false);
    const next: LocationGate = { ...point, radiusM: radius };
    update({
      settings: { ...question.settings, locationGate: next },
      locationGatePending: false,
    });
    setCoordinateDraft({ lat: String(point.lat), lng: String(point.lng) });
    setChoosing(false);
    setLocationError(null);
    setFlyTo({
      latitude: point.lat,
      longitude: point.lng,
      zoom: Math.max(11, Math.min(17, 17 - Math.log2(radius / 40))),
      durationMs: 500,
    });
  }
  function changeRadius(next: number) {
    if (!Number.isFinite(next) || next < 20 || next > 5000) return;
    setRadiusDraft(next);
    if (gate)
      update({
        settings: {
          ...question.settings,
          locationGate: { ...gate, radiusM: next },
        },
      });
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2 || readOnly) return;
    const version = ++searchVersion.current;
    setStatus("loading");
    try {
      const matches = await searchMapPlaces(query);
      if (!mounted.current || version !== searchVersion.current) return;
      setResults(matches);
      setStatus(matches.length ? "idle" : "empty");
    } catch {
      if (!mounted.current || version !== searchVersion.current) return;
      setResults([]);
      setStatus("error");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationError(
        "המכשיר אינו תומך בקבלת מיקום. חפשו מקום או הזינו קואורדינטות.",
      );
      return;
    }
    setLocationBusy(true);
    setLocationError(null);
    const version = ++locationVersion.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current || version !== locationVersion.current) return;
        // Read the current question and radius after the asynchronous lookup.
        latestPlace.current({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        if (!mounted.current || version !== locationVersion.current) return;
        setLocationBusy(false);
        setLocationError(
          "לא התקבל מיקום. אפשרו הרשאה בדפדפן, חפשו מקום או הזינו קואורדינטות.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <fieldset
      disabled={readOnly}
      className="min-w-0 rounded-md border border-bsy-stone-200 bg-bsy-paper-warm/40 p-3 sm:p-4"
    >
      <legend className="px-1 text-sm font-bold text-bsy-brown">
        פתיחה לפי מיקום (במשחק אסינכרוני)
      </legend>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input
          className="h-5 w-5 accent-bsy-forest"
          type="checkbox"
          checked={enabled}
          disabled={readOnly || locationBusy}
          onChange={(event) => {
            setChoosing(event.target.checked && !gate);
            setResults([]);
            setStatus("idle");
            searchVersion.current++;
            if (event.target.checked && !gate)
              update({ locationGatePending: true });
            if (!event.target.checked)
              update({
                locationGatePending: false,
                settings: { ...question.settings, locationGate: null },
              });
          }}
        />
        התחנה תיפתח רק בהגעה למקום
      </label>
      {enabled ? (
        <div className="mt-2 flex min-w-0 flex-col gap-3">
          <p className="m-0 text-sm leading-relaxed text-bsy-stone-700">
            חפשו מקום או סמנו נקודה במפה. המעגל מציג את טווח ההגעה לפתיחת התחנה;
            זמן המענה מתחיל רק לאחר הפתיחה.
          </p>
          <div className="relative flex h-[320px] min-w-0 flex-col overflow-hidden rounded-md border border-bsy-stone-200 bg-bsy-paper-warm">
            <MapSearchBox
              query={query}
              results={results}
              status={status}
              onQueryChange={(value) => {
                searchVersion.current++;
                setQuery(value);
                setResults([]);
                setStatus("idle");
              }}
              onSubmit={search}
              onSelectResult={(result) => {
                place({ lat: result.lat, lng: result.lng });
                setQuery(result.name);
                setResults([]);
                setStatus("idle");
              }}
              onDismissResults={() => {
                setResults([]);
                setStatus("idle");
              }}
            />
            <div className="min-h-0 flex-1">
              <InteractiveMap
                key={`${question.clientId}-gate`}
                baseStyle="streets"
                labelLevel="all"
                disabled={readOnly}
                initialView={{
                  latitude: gate?.lat ?? 31.5,
                  longitude: gate?.lng ?? 34.9,
                  zoom: gate ? 15 : 7,
                }}
                flyTo={flyTo}
                onMapClick={place}
                ariaLabel="בחירת מיקום פתיחת התחנה"
                radiusArea={
                  gate ? { center: gate, radiusM: radius } : undefined
                }
                markers={
                  gate
                    ? [
                        {
                          key: "gate",
                          position: gate,
                          draggable: !readOnly,
                          onDragEnd: place,
                          color: "#306030",
                          ariaLabel: "מיקום פתיחת התחנה",
                        },
                      ]
                    : []
                }
              />
            </div>
          </div>
          {!gate ? (
            <p role="status" className="m-0 text-sm font-bold text-bsy-brown">
              יש לבחור מיקום. פתיחה לפי GPS תישמר רק אחרי בחירת נקודה.
            </p>
          ) : (
            <p className="m-0 text-sm text-bsy-forest">
              נבחר מיקום פתיחה. אפשר לגרור את הסיכה כדי לדייק אותו.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={readOnly || locationBusy}
              onClick={locate}
            >
              {locationBusy ? "מאתרים מיקום…" : "השתמש במיקום שלי"}
            </button>
            {gate ? (
              <button
                type="button"
                className={buttonClass}
                disabled={readOnly}
                onClick={() =>
                  setFlyTo({
                    latitude: gate.lat,
                    longitude: gate.lng,
                    zoom: 15,
                    durationMs: 500,
                  })
                }
              >
                מרכוז המפה לתחנה
              </button>
            ) : null}
            {question.map?.geo.target ? (
              <button
                type="button"
                className={buttonClass}
                disabled={readOnly}
                onClick={() => place(question.map!.geo.target)}
              >
                השתמשו ביעד של שאלת המפה
              </button>
            ) : null}
          </div>
          {locationError ? (
            <p role="alert" className="m-0 text-sm text-bsy-error">
              {locationError}
            </p>
          ) : null}
          <div className="rounded-md border border-bsy-stone-200 bg-white p-3">
            <label
              htmlFor={radiusId}
              className="block text-sm font-bold text-bsy-stone-700"
            >
              רדיוס פתיחת התחנה (מטרים)
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range"
                className="min-h-11 min-w-0 flex-1 accent-bsy-forest"
                aria-label="רדיוס פתיחת GPS במטרים"
                min={20}
                max={5000}
                step={10}
                value={radius}
                onChange={(event) => changeRadius(event.target.valueAsNumber)}
              />
              <input
                id={radiusId}
                type="number"
                dir="ltr"
                min={20}
                max={5000}
                step={10}
                className={`${inputClass} max-w-28`}
                value={radius}
                onChange={(event) => changeRadius(event.target.valueAsNumber)}
              />
            </div>
            <p className="m-0 text-xs leading-relaxed text-bsy-stone-700">
              בחרו טווח שמאפשר GPS בתנאי שטח. רדיוס זה שונה מטווח הטעות בתשובת
              מפה.
            </p>
          </div>
          <details className="rounded-md border border-bsy-stone-200 bg-white p-3">
            <summary className="min-h-8 cursor-pointer text-sm font-bold text-bsy-forest">
              קואורדינטות — אפשרות מתקדמת
            </summary>
            <p className="text-xs text-bsy-stone-700">
              אפשר להזין נקודה גם כשאין חיבור למפה.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["lat", "קו רוחב", -90, 90],
                  ["lng", "קו אורך", -180, 180],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="text-sm">
                  {label}
                  <input
                    type="number"
                    dir="ltr"
                    step={0.00001}
                    min={min}
                    max={max}
                    className={inputClass}
                    value={coordinateDraft[key]}
                    onChange={(event) =>
                      setCoordinateDraft((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              onClick={() => {
                const lat = Number(coordinateDraft.lat),
                  lng = Number(coordinateDraft.lng);
                if (
                  !coordinateDraft.lat.trim() ||
                  !coordinateDraft.lng.trim() ||
                  !Number.isFinite(lat) ||
                  !Number.isFinite(lng) ||
                  lat < -90 ||
                  lat > 90 ||
                  lng < -180 ||
                  lng > 180
                ) {
                  setLocationError(
                    "הזינו קו רוחב וקו אורך תקינים לפני שמירת הנקודה.",
                  );
                  return;
                }
                place({ lat, lng });
              }}
            >
              שמירת נקודה לפי קואורדינטות
            </button>
          </details>
        </div>
      ) : null}
    </fieldset>
  );
}
