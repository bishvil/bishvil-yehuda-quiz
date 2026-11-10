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
        aria-busy={status === "loading"}
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
          className="min-h-11 min-w-0 flex-1 rounded-md border border-bsy-stone-200 px-3 py-1.5 text-[13px] text-bsy-ink outline-none focus:border-bsy-forest"
          aria-label="חיפוש מקום במפה"
        />
        <button
          type="submit"
          disabled={query.trim().length < 2 || status === "loading"}
          className="min-h-11 rounded-full bg-bsy-forest px-3 py-1.5 text-[12px] font-bold text-bsy-paper disabled:cursor-not-allowed disabled:bg-bsy-stone-300"
        >
          {status === "loading" ? "מחפש..." : "חיפוש"}
        </button>
      </form>

      {showResults ? (
        <div
          className="absolute inset-x-2 top-[62px] z-20 max-h-40 overflow-y-auto rounded-md border border-bsy-stone-200 bg-white/95 p-1.5 text-[12px] shadow-[0_2px_8px_rgba(74,63,38,0.12)]"
          dir="rtl"
          role="region"
          aria-label="תוצאות חיפוש מקום"
          onKeyDown={(event) => {
            if (event.key === "Escape") onDismissResults();
          }}
        >
          <button
            type="button"
            onClick={onDismissResults}
            className="mb-1 min-h-11 rounded-full px-3 py-2 font-bold text-bsy-forest"
          >
            סגירת תוצאות
          </button>
          {status === "empty" ? (
            <p role="status" className="m-0 px-2 py-1.5 text-bsy-stone-700">
              לא נמצאו תוצאות.
            </p>
          ) : null}
          {status === "error" ? (
            <p role="alert" className="m-0 px-2 py-1.5 text-bsy-error">
              החיפוש נכשל. נסו שוב.
            </p>
          ) : null}
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => onSelectResult(result)}
              className="block min-h-11 w-full rounded-md px-3 py-2 text-right text-bsy-ink hover:bg-bsy-paper-warm"
            >
              {result.name}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
