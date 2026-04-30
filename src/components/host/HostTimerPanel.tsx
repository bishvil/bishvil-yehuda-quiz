interface HostTimerPanelProps {
  remainingSeconds: number;
  fraction: number;
  isWarning: boolean;
  /** Optional response counter rendered below the bar on the desktop variant. */
  responseCount?: number;
  totalPlayers?: number;
  variant?: "desktop" | "compact";
}

/**
 * Big numeric timer (XX seconds) with a thin progress track underneath.
 * Used in the host's right rail on desktop and at the top of the field
 * view on mobile (compact variant).
 */
export function HostTimerPanel({
  remainingSeconds,
  fraction,
  isWarning,
  responseCount,
  totalPlayers,
  variant = "desktop",
}: HostTimerPanelProps) {
  const percent = Math.min(100, Math.max(0, fraction * 100));
  const display = String(Math.max(0, remainingSeconds)).padStart(2, "0");

  if (variant === "compact") {
    return (
      <div
        className={[
          "flex items-center gap-3 rounded-md border bg-white px-3 py-2",
          isWarning ? "border-bsy-error" : "border-bsy-stone-100",
        ].join(" ")}
      >
        <div
          className={[
            "font-mono text-2xl",
            isWarning ? "text-bsy-error" : "text-bsy-brown",
          ].join(" ")}
          dir="ltr"
        >
          {display}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bsy-stone-100">
            <div
              className={[
                "h-full rounded-full transition-[width] duration-200 ease-out",
                isWarning ? "bg-bsy-error" : "bg-bsy-lime",
              ].join(" ")}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-[11px] text-bsy-stone-400">שניות נותרו</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-bsy-stone-100 bg-white px-5 py-6 text-center">
      <div
        className={[
          "font-mono text-6xl leading-none",
          isWarning ? "text-bsy-error" : "text-bsy-brown",
        ].join(" ")}
        dir="ltr"
        aria-live="polite"
        aria-atomic="true"
      >
        {display}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bsy-stone-100">
        <div
          className={[
            "h-full rounded-full transition-[width] duration-200 ease-out",
            isWarning ? "bg-bsy-error" : "bg-bsy-lime",
          ].join(" ")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-bsy-stone-400">
        שניות נותרו
      </div>
      {typeof responseCount === "number" && typeof totalPlayers === "number" ? (
        <div className="mt-1 text-[13px] text-bsy-stone-700">
          <b className="font-[var(--font-display)] text-base text-bsy-brown">
            {responseCount}
          </b>{" "}
          מתוך {totalPlayers} השיבו
        </div>
      ) : null}
    </div>
  );
}
