interface FeedbackCardProps {
  isCorrect: boolean;
  explanation?: string | null;
}

/**
 * Reveal feedback row — used at the bottom of the play screen once the
 * server has revealed the question. Two variants: correct (lime), wrong
 * (clay). No emoji — uses ✓ / ✕ glyphs in the design system.
 */
export function FeedbackCard({ isCorrect, explanation }: FeedbackCardProps) {
  return (
    <div
      className={[
        "mt-4 flex items-start gap-3 rounded-md border p-3 text-[13px] leading-relaxed",
        isCorrect
          ? "border-bsy-lime bg-bsy-lime/15 text-bsy-stone-700"
          : "border-bsy-error/30 bg-bsy-error/[0.06] text-bsy-stone-700",
      ].join(" ")}
      role="status"
    >
      <span
        aria-hidden="true"
        className={[
          "inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold",
          isCorrect ? "bg-bsy-forest text-white" : "bg-bsy-error text-white",
        ].join(" ")}
      >
        {isCorrect ? "✓" : "✕"}
      </span>
      <div>
        <p className="m-0 font-[var(--font-display)] text-base text-bsy-brown">
          {isCorrect ? "מצוין!" : "לא מדויק"}
        </p>
        {explanation ? (
          <p className="m-0 mt-1 text-[13px] text-bsy-stone-700">{explanation}</p>
        ) : null}
      </div>
    </div>
  );
}
