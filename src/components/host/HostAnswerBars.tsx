import { QUESTION_OPTION_LETTERS } from "@/src/lib/constants";
import {
  computeAnswerBars,
  type AnswerBarDatum,
} from "@/src/lib/host/controls";

export interface HostAnswerBarsOption {
  id: string;
  text: string;
}

interface HostAnswerBarsProps {
  options: HostAnswerBarsOption[];
  counts: Record<string, number>;
  /** Correct option ids — only passed when revealed. Pre-reveal must be `null`. */
  correctIds: string[] | null;
  variant?: "desktop" | "mobile";
}

/**
 * Live answer-distribution bars for the host. Two visual variants share the
 * same data:
 *  - desktop — vertical column-fill (projector view)
 *  - mobile  — horizontal row-fill (host phone)
 *
 * Critical rule: `correctIds` must remain `null` until the question is in
 * `revealed` state. The component never highlights a "correct" column
 * pre-reveal, even if the caller mis-passes it. ADR-0006 §8 + spec §3.
 */
export function HostAnswerBars({
  options,
  counts,
  correctIds,
  variant = "desktop",
}: HostAnswerBarsProps) {
  const bars = computeAnswerBars({ options, counts });
  const isRevealed = Array.isArray(correctIds);

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-2.5">
        {options.map((option, index) => {
          const datum = bars[index] ?? emptyDatum(option.id);
          const isCorrect = isRevealed && correctIds?.includes(option.id);
          return (
            <MobileBarRow
              key={option.id}
              letter={QUESTION_OPTION_LETTERS[index] ?? ""}
              text={option.text}
              datum={datum}
              isCorrect={Boolean(isCorrect)}
              showCorrect={isRevealed}
            />
          );
        })}
      </div>
    );
  }

  const columnCount = options.length;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid items-stretch gap-3"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option, index) => {
          const datum = bars[index] ?? emptyDatum(option.id);
          const isCorrect = isRevealed && correctIds?.includes(option.id);
          return (
            <DesktopBarColumn
              key={option.id}
              letter={QUESTION_OPTION_LETTERS[index] ?? ""}
              text={option.text}
              datum={datum}
              isCorrect={Boolean(isCorrect)}
              showCorrect={isRevealed}
            />
          );
        })}
      </div>
    </div>
  );
}

function emptyDatum(optionId: string): AnswerBarDatum {
  return { optionId, count: 0, percent: 0, fillFraction: 0 };
}

interface BarRowProps {
  letter: string;
  text: string;
  datum: AnswerBarDatum;
  isCorrect: boolean;
  showCorrect: boolean;
}

function DesktopBarColumn({ letter, text, datum, isCorrect, showCorrect }: BarRowProps) {
  const fillPct = Math.round(datum.fillFraction * 100);
  const borderClass = isCorrect
    ? "border-bsy-forest"
    : showCorrect
      ? "border-bsy-stone-100 opacity-60"
      : "border-bsy-stone-100";
  const fillClass = isCorrect ? "bg-bsy-forest/30" : "bg-bsy-lime/40";

  return (
    <div
      className={[
        "relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-md border bg-white p-4 transition-all",
        borderClass,
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className={[
          "absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-out",
          fillClass,
        ].join(" ")}
        style={{ height: `${fillPct}%` }}
      />
      <div className="relative flex items-start gap-2">
        <span
          className={[
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            isCorrect ? "bg-bsy-forest text-bsy-paper" : "bg-bsy-lime text-bsy-forest-deep",
          ].join(" ")}
          aria-hidden="true"
        >
          {letter}
        </span>
        <span className="text-start text-sm leading-snug text-bsy-ink">{text}</span>
      </div>
      <div className="relative flex items-baseline justify-between gap-2 text-bsy-brown">
        <span className="font-[var(--font-display)] text-3xl">{datum.percent}%</span>
        <span className="text-[12px] text-bsy-stone-700">{datum.count} משיבים</span>
      </div>
    </div>
  );
}

function MobileBarRow({ letter, text, datum, isCorrect, showCorrect }: BarRowProps) {
  const fillPct = Math.round(datum.fillFraction * 100);
  const borderClass = isCorrect
    ? "border-bsy-forest"
    : showCorrect
      ? "border-bsy-stone-100 opacity-60"
      : "border-bsy-stone-100";
  const fillClass = isCorrect ? "bg-bsy-forest" : "bg-bsy-lime";

  return (
    <div className={["rounded-md border bg-white p-3", borderClass].join(" ")}>
      <div className="flex items-center gap-2">
        <span
          className={[
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
            isCorrect ? "bg-bsy-forest text-bsy-paper" : "bg-bsy-lime text-bsy-forest-deep",
          ].join(" ")}
          aria-hidden="true"
        >
          {letter}
        </span>
        <span className="flex-1 text-start text-sm text-bsy-ink">{text}</span>
        <span className="font-[var(--font-display)] text-base text-bsy-brown">
          {datum.percent}%
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bsy-stone-100">
        <div
          className={[
            "h-full rounded-full transition-[width] duration-300 ease-out",
            fillClass,
          ].join(" ")}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-bsy-stone-400">{datum.count} משיבים</div>
    </div>
  );
}
