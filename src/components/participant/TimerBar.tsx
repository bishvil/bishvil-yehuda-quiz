interface TimerBarProps {
  /** 0–1, fraction of time remaining. */
  fraction: number;
  remainingSeconds: number;
  isWarning: boolean;
  /** Hide the bar (post-submit, post-reveal). The seconds chip stays. */
  showBar?: boolean;
}

/**
 * Pill-shaped countdown chip with optional under-track bar.
 * Pulses red when `isWarning` and the question is still active.
 */
export function TimerBar({
  fraction,
  remainingSeconds,
  isWarning,
  showBar = true,
}: TimerBarProps) {
  const percent = Math.min(100, Math.max(0, fraction * 100));
  const display = String(Math.max(0, remainingSeconds)).padStart(2, "0");

  return (
    <div className="flex items-center gap-3">
      <div
        className={[
          "inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 font-mono text-sm",
          isWarning
            ? "border-bsy-error text-bsy-error"
            : "border-bsy-stone-100 text-bsy-brown",
        ].join(" ")}
        aria-live="polite"
        aria-atomic="true"
      >
        {isWarning ? (
          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-bsy-error">
            <span className="absolute inset-0 animate-ping rounded-full bg-bsy-error/50" />
          </span>
        ) : null}
        <span dir="ltr">{display}</span>
      </div>
      {showBar ? (
        <div
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-bsy-stone-100"
          aria-hidden="true"
        >
          <div
            className={[
              "h-full rounded-full transition-[width] duration-200 ease-out",
              isWarning ? "bg-bsy-error" : "bg-bsy-lime",
            ].join(" ")}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
