interface ScoreCircleProps {
  score: number;
  maxScore: number;
}

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * SVG donut showing score as a stroke-dasharray fill against a track ring.
 * 160×160 viewBox, rotated -90° so the fill starts at the top.
 */
export function ScoreCircle({ score, maxScore }: ScoreCircleProps) {
  const safeMax = maxScore > 0 ? maxScore : 1;
  const percent = Math.min(100, Math.max(0, (score / safeMax) * 100));
  const dash = (percent / 100) * CIRCUMFERENCE;

  return (
    <div
      className="relative mx-auto h-40 w-40"
      role="img"
      aria-label={`${score} מתוך ${maxScore} נקודות`}
    >
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          stroke="#E5DFD2"
          strokeWidth={10}
          fill="none"
        />
        <circle
          cx="80"
          cy="80"
          r={RADIUS}
          stroke="#A0C040"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-[var(--font-display)] text-5xl leading-none text-bsy-brown">
          {score.toLocaleString("he-IL")}
        </span>
        <span className="mt-1 text-[13px] text-bsy-stone-400">
          נקודות מתוך {maxScore.toLocaleString("he-IL")}
        </span>
      </div>
    </div>
  );
}
