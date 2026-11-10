"use client";

import { useMemo, useState } from "react";

import { avatarInitial } from "@/src/lib/participant/identity";

export interface HostPlayer {
  id: string;
  displayName: string;
  score: number;
  answered: boolean;
}

interface HostPlayerListProps {
  players: HostPlayer[];
  title?: string;
  /** Hides answer status before any question is live. */
  hideAnsweredDot?: boolean;
  emptyLabel?: string;
}

/** A bounded, keyboard-scrollable roster with readable answer states. */
export function HostPlayerList({
  players,
  title = "משתתפים",
  hideAnsweredDot = false,
  emptyLabel = "אין משתתפים מחוברים עדיין.",
}: HostPlayerListProps) {
  const [query, setQuery] = useState("");
  const [waitingOnly, setWaitingOnly] = useState(false);
  const showFilters = players.length > 8;
  const filtered = useMemo(() => {
    const normalized = showFilters ? query.trim().toLocaleLowerCase("he") : "";
    return players.filter(
      (player) =>
        (!normalized ||
          player.displayName.toLocaleLowerCase("he").includes(normalized)) &&
        (!showFilters || !waitingOnly || hideAnsweredDot || !player.answered),
    );
  }, [players, query, waitingOnly, hideAnsweredDot, showFilters]);

  return (
    <section
      aria-label={title}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md border border-bsy-stone-100 bg-white"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-bsy-stone-100 px-3 py-2">
        <h3 className="m-0 font-[var(--font-display)] text-base text-bsy-brown">
          {title}
        </h3>
        <span
          className="text-[12px] text-bsy-stone-700"
          aria-label={`${filtered.length} מתוך ${players.length} משתתפים`}
          dir="ltr"
        >
          {filtered.length === players.length
            ? players.length
            : `${filtered.length}/${players.length}`}
        </span>
      </header>
      {showFilters ? (
        <div className="flex shrink-0 flex-col gap-1 border-b border-bsy-stone-100 px-3 py-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="חיפוש משתתף ברשימה"
            placeholder="חיפוש משתתף"
            className="min-h-11 w-full rounded-full border border-bsy-stone-200 bg-bsy-paper px-3 py-2 text-[13px] text-bsy-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
          />
          {!hideAnsweredDot ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px] text-bsy-stone-700">
              <input
                type="checkbox"
                checked={waitingOnly}
                onChange={(event) => setWaitingOnly(event.target.checked)}
                className="h-4 w-4 accent-bsy-forest"
              />
              ממתינים בלבד
            </label>
          ) : null}
        </div>
      ) : null}
      <ol
        aria-label="רשימת משתתפים"
        tabIndex={players.length > 0 ? 0 : undefined}
        className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-bsy-forest"
      >
        {filtered.length === 0 ? (
          <li className="flex min-h-[80px] shrink-0 items-center justify-center px-3 py-4 text-center text-[13px] text-bsy-stone-700">
            {players.length === 0
              ? emptyLabel
              : waitingOnly && !query.trim()
                ? "כולם ענו לתחנה הזו."
                : "לא נמצאו משתתפים התואמים לחיפוש ולסינון."}
          </li>
        ) : (
          filtered.map((player) => (
            <li
              key={player.id}
              className="flex shrink-0 items-center gap-2 border-b border-dashed border-bsy-stone-100 px-3 py-2 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bsy-lime font-[var(--font-display)] text-[13px] text-bsy-forest-deep"
              >
                {avatarInitial(player.displayName)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-start text-sm text-bsy-ink"
                title={player.displayName}
              >
                {player.displayName}
              </span>
              <span className="shrink-0 font-[var(--font-display)] text-[15px] text-bsy-brown">
                {player.score.toLocaleString("he-IL")}
              </span>
              {hideAnsweredDot ? null : (
                <span
                  className={[
                    "inline-flex min-w-14 shrink-0 items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
                    player.answered
                      ? "bg-bsy-lime/20 text-bsy-forest-deep"
                      : "bg-bsy-paper-warm text-bsy-stone-700",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "h-1.5 w-1.5 rounded-full",
                      player.answered ? "bg-bsy-forest" : "bg-bsy-warn",
                    ].join(" ")}
                  />
                  {player.answered ? "ענה" : "ממתין"}
                </span>
              )}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
