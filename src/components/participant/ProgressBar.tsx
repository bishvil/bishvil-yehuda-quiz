interface ProgressBarProps {
  /** Step the user is on (1-based). */
  current: number;
  total: number;
  ariaLabel?: string;
}

/**
 * Thin progress bar — `current/total` proportion. Accent fill only,
 * paper-warm track. Used at the top of every question to show how far
 * the participant has come through the quiz.
 */
export function ProgressBar({ current, total, ariaLabel = "התקדמות" }: ProgressBarProps) {
  const safeTotal = total > 0 ? total : 1;
  const percent = Math.min(100, Math.max(0, (current / safeTotal) * 100));

  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-bsy-stone-100"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(current, total)}
    >
      <div
        className="h-full rounded-full bg-bsy-lime transition-[width] duration-200 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
