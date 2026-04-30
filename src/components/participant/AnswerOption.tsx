"use client";

import { QUESTION_OPTION_LETTERS } from "@/src/lib/constants";

export type AnswerOptionState =
  | "default"
  | "selected"
  | "correct"
  | "wrong"
  | "dim";

interface AnswerOptionProps {
  /** 0-based index — used to compute the Hebrew letter marker (א, ב, ג…). */
  index: number;
  label: string;
  state: AnswerOptionState;
  /** Disable interaction in revealed state. */
  disabled?: boolean;
  onSelect: () => void;
}

const STATE_CLASSES: Record<AnswerOptionState, string> = {
  default:
    "border-bsy-stone-100 bg-white text-bsy-ink hover:border-bsy-lime hover:bg-bsy-paper-warm",
  selected:
    "border-bsy-forest bg-white text-bsy-ink shadow-[0_0_0_3px_rgba(48,96,48,0.12)]",
  correct: "border-bsy-lime bg-bsy-lime/20 text-bsy-ink",
  wrong: "border-bsy-error bg-bsy-error/10 text-bsy-ink",
  dim: "border-bsy-stone-100 bg-white text-bsy-ink opacity-45",
};

const MARKER_CLASSES: Record<AnswerOptionState, string> = {
  default: "border-bsy-stone-100 bg-bsy-paper-warm text-bsy-brown",
  selected: "border-bsy-forest bg-bsy-forest text-bsy-paper",
  correct: "border-bsy-lime bg-bsy-lime text-bsy-forest-deep",
  wrong: "border-bsy-error bg-bsy-error text-white",
  dim: "border-bsy-stone-100 bg-bsy-paper-warm text-bsy-brown",
};

/**
 * Pill-cell answer button. Five visual states cover the full lifecycle:
 * pre-submit (default/selected) → reveal (correct/wrong/dim).
 */
export function AnswerOption({
  index,
  label,
  state,
  disabled = false,
  onSelect,
}: AnswerOptionProps) {
  const letter = QUESTION_OPTION_LETTERS[index] ?? `${index + 1}`;
  const isCorrect = state === "correct";
  const isWrong = state === "wrong";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={[
        "group flex w-full items-center gap-3 rounded-md border-2 px-4 py-3 text-start",
        "font-medium transition-all duration-150 ease-out",
        "disabled:cursor-not-allowed",
        STATE_CLASSES[state],
      ].join(" ")}
      aria-pressed={state === "selected"}
    >
      <span
        aria-hidden="true"
        className={[
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-[1.5px] font-[var(--font-display)] text-sm",
          "transition-colors duration-150",
          MARKER_CLASSES[state],
        ].join(" ")}
      >
        {letter}
      </span>
      <span className="flex-1 leading-snug">{label}</span>
      {isCorrect ? (
        <span aria-hidden="true" className="ms-auto font-mono text-bsy-forest">
          ✓
        </span>
      ) : null}
      {isWrong ? (
        <span aria-hidden="true" className="ms-auto font-mono text-bsy-error">
          ✕
        </span>
      ) : null}
    </button>
  );
}
