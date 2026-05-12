import { formatKm } from "@/src/lib/format/distance";
import { formatAnswerSeconds } from "@/src/lib/time/answer-duration";

interface FeedbackCardProps {
  isCorrect: boolean;
  explanation?: string | null;
  /**
   * Earned score for this question (shown when provided alongside totalPoints).
   * Enables "X/Y נקודות" display for partial-credit questions.
   */
  score?: number | null;
  /** Maximum possible points for the question. */
  totalPoints?: number | null;
  /** Rounded elapsed answer time inside the configured question timer. */
  answerSeconds?: number | null;
  /**
   * Haversine distance in km — passed for geo map questions to render the
   * "Z ק״מ מהיעד" suffix (ADR-0006 Open Q2 RESOLVED).
   */
  distanceKm?: number | null;
  /**
   * Number of correct options selected vs total correct options — used for
   * the multi-select reveal hint "X מתוך W סימונים נכונים".
   */
  correctCount?: number | null;
  /** Total count of correct options in the question. */
  totalCorrect?: number | null;
}

/**
 * Reveal feedback row — used at the bottom of the play screen once the
 * server has revealed the question. Two variants: correct (lime), wrong
 * (clay). No emoji — uses ✓ / ✕ glyphs in the design system.
 *
 * Partial-credit display:
 *  - Map (geo): shows "X/Y נקודות · Z ק״מ מהיעד"
 *  - Multi-select: shows "X/Y נקודות · Z מתוך W סימונים נכונים"
 *  - Binary correct: shows "מצוין!" with score if provided
 */
export function FeedbackCard({
  isCorrect,
  explanation,
  score,
  totalPoints,
  answerSeconds,
  distanceKm,
  correctCount,
  totalCorrect,
}: FeedbackCardProps) {
  const hasScore = score != null && totalPoints != null;
  const answerTime = formatAnswerSeconds(answerSeconds);
  const hasDistance = distanceKm != null;
  const hasMultiDetail = correctCount != null && totalCorrect != null;

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
        {hasScore ? (
          <p className="m-0 mt-1 text-[13px] font-bold text-bsy-stone-700">
            {score}/{totalPoints} נקודות
            {hasDistance ? ` · ${formatKm(distanceKm)} ק״מ מהיעד` : null}
            {hasMultiDetail && !hasDistance
              ? ` · ${correctCount} מתוך ${totalCorrect} סימונים נכונים`
              : null}
          </p>
        ) : null}
        {answerTime ? (
          <p className="m-0 mt-1 text-[13px] font-bold text-bsy-stone-700">
            זמן מענה: {answerTime}
          </p>
        ) : null}
        {!hasScore && hasDistance ? (
          <p className="m-0 mt-1 text-[13px] text-bsy-stone-700">
            {formatKm(distanceKm)} ק״מ מהיעד
          </p>
        ) : null}
        {explanation ? (
          <p className="m-0 mt-1 text-[13px] text-bsy-stone-700">
            {explanation}
          </p>
        ) : null}
      </div>
    </div>
  );
}
