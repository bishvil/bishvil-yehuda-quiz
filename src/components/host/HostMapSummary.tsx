interface HostMapSummaryProps {
  imageUrl: string | null;
  /** Reveal-only target coordinates (% of image, 0-100). */
  target: { x: number; y: number } | null;
  toleranceRadiusPercent: number | null;
  isRevealed: boolean;
}

/**
 * Map-question summary for the host. Pre-reveal we only show the bare map +
 * an explanatory line; per ADR-0008 §2 the target coords MUST NOT ship to
 * any client until the question is revealed. Post-reveal we draw the
 * target dot and the tolerance ring.
 */
export function HostMapSummary({
  imageUrl,
  target,
  toleranceRadiusPercent,
  isRevealed,
}: HostMapSummaryProps) {
  if (!imageUrl) {
    return (
      <div className="rounded-md border border-bsy-error/30 bg-bsy-error/10 p-3 text-center text-sm text-bsy-error">
        מפת השאלה חסרה. צרו קשר עם המארגנים.
      </div>
    );
  }

  const radius = toleranceRadiusPercent ?? 8;

  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-3">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-md bg-bsy-paper-warm">
        {/* Generic external map asset — eslint-disable-next-line @next/next/no-img-element */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {isRevealed && target ? (
          <>
            <div
              aria-hidden="true"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bsy-forest bg-bsy-forest/15"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: `${radius * 2}%`,
                aspectRatio: "1 / 1",
              }}
            />
            <div
              aria-hidden="true"
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-bsy-forest"
              style={{
                left: `${target.x}%`,
                top: `${target.y}%`,
                width: 14,
                height: 14,
              }}
            />
          </>
        ) : null}
      </div>
      <p className="mt-2 text-center text-[12px] text-bsy-stone-700">
        {isRevealed
          ? "התשובה הנכונה נחשפה — הסימון מציג את היעד ואת רדיוס הסובלנות."
          : "לחיצה על ׳חשיפת התשובה׳ תציג את היעד והסובלנות לכל המשתתפים."}
      </p>
    </div>
  );
}
