"use client";

import type { FormEvent } from "react";

import type { PlaceSearchResult } from "@/src/lib/maps/place-search";

export type MapSearchStatus = "idle" | "loading" | "empty" | "error";

interface MapSearchBoxProps {
  query: string;
  results: PlaceSearchResult[];
  status: MapSearchStatus;
  onQueryChange: (next: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectResult: (result: PlaceSearchResult) => void;
  onDismissResults: () => void;
}

export function MapSearchBox({
  query,
  results,
  status,
  onQueryChange,
  onSubmit,
  onSelectResult,
  onDismissResults,
}: MapSearchBoxProps) {
  const showResults =
    results.length > 0 || status === "empty" || status === "error";

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="relative z-10 flex flex-shrink-0 gap-2 border-b border-bsy-stone-200 bg-white/95 p-2"
        dir="rtl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onDismissResults();
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="חיפוש עיר, יישוב או אתר"
          className="min-w-0 flex-1 rounded-md border border-bsy-stone-200 px-3 py-1.5 text-[13px] text-bsy-ink outline-none focus:border-bsy-forest"
          aria-label="חיפוש מקום במפה"
        />
        <button
          type="submit"
          disabled={query.trim().length < 2 || status === "loading"}
          className="rounded-md bg-bsy-forest px-3 py-1.5 text-[12px] font-bold text-bsy-paper disabled:cursor-not-allowed disabled:bg-bsy-stone-300"
        >
          {status === "loading" ? "מחפש..." : "חיפוש"}
        </button>
      </form>

      {showResults ? (
        <div
          className="absolute inset-x-2 top-[50px] z-20 max-h-40 overflow-y-auto rounded-md border border-bsy-stone-200 bg-white/95 p-1.5 text-[12px] shadow-[0_2px_8px_rgba(74,63,38,0.12)]"
          dir="rtl"
        >
          {status === "empty" ? (
            <p className="m-0 px-2 py-1.5 text-bsy-stone-700">
              לא נמצאו תוצאות.
            </p>
          ) : null}
          {status === "error" ? (
            <p className="m-0 px-2 py-1.5 text-bsy-error">
              החיפוש נכשל. נסו שוב.
            </p>
          ) : null}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onSelectResult(result)}
              className="block w-full rounded px-2 py-1.5 text-right text-bsy-ink hover:bg-bsy-paper-warm"
            >
              {result.name}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
