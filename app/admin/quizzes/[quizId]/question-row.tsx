"use client";

import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";

interface QuestionRowProps {
  question: EditableQuestion;
  index: number;
  active: boolean;
  onSelect: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function QuestionRow({
  question,
  index,
  active,
  onSelect,
  onMoveUp,
  onMoveDown,
}: QuestionRowProps) {
  const optionsCount = question.options?.length ?? 0;
  const correctCount = question.correctIds?.length ?? 0;

  return (
    <div
      className={[
        "flex items-stretch gap-2 rounded-md border bg-white px-3 py-2 transition-colors",
        active
          ? "border-bsy-forest shadow-[var(--shadow-xs)]"
          : "border-bsy-stone-100 hover:border-bsy-forest",
      ].join(" ")}
    >
      <div className="flex flex-col items-center justify-center gap-0.5 text-bsy-stone-400">
        <button
          type="button"
          aria-label="הזז למעלה"
          onClick={onMoveUp}
          disabled={!onMoveUp}
          className="text-[10px] disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="הזז למטה"
          onClick={onMoveDown}
          disabled={!onMoveDown}
          className="text-[10px] disabled:opacity-30"
        >
          ▼
        </button>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 flex-col gap-1 text-start"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-bsy-stone-400">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="line-clamp-1 text-[14px] text-bsy-ink">
            {question.prompt || "(בלי כותרת)"}
          </span>
          <span className="ms-auto rounded-full bg-bsy-stone-50 px-2 py-0.5 text-[11px] text-bsy-stone-700">
            {QUESTION_TYPE_LABELS[question.type]}
          </span>
        </div>
        <div className="text-[11px] text-bsy-stone-400">
          {question.type === "map"
            ? `נקודה על מפה · ${question.timeSeconds} שניות`
            : `${optionsCount} תשובות · ${question.timeSeconds} שניות · ${correctCount} נכונות`}
        </div>
      </button>
    </div>
  );
}
