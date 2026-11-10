"use client";

import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";

interface QuestionRowProps {
  question: EditableQuestion;
  index: number;
  active: boolean;
  onSelect: () => void;
}

export function QuestionRow({
  question,
  index,
  active,
  onSelect,
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
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 text-start"
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
          {question.type === "content"
            ? "קטע מידע · ללא ניקוד"
            : `${question.type === "map" ? "נקודה על מפה" : question.type === "open" ? "תשובה פתוחה" : `${optionsCount} תשובות · ${correctCount} נכונות`} · ${question.settings?.timeLimitEnabled === false ? "ללא הגבלת זמן" : `${question.timeSeconds} שניות`}`}
          {question.settings?.locationGate ? " · פתיחה לפי מיקום" : ""}
        </div>
      </button>
    </div>
  );
}
