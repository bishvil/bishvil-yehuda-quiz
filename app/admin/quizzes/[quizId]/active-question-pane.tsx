"use client";

import { QuestionEditor } from "@/src/components/admin/QuestionEditor";
import { QUESTION_TYPE_LABELS } from "@/src/lib/constants";
import type { EditableQuestion } from "@/src/lib/admin/quiz-editor";

import type { QuizEditorMobileView } from "./quiz-editor-utils";

interface ActiveQuestionPaneProps {
  activeQuestion: EditableQuestion | null;
  mobileView: QuizEditorMobileView;
  readOnly: boolean;
  onMobileViewChange: (next: QuizEditorMobileView) => void;
  onQuestionChange: (next: EditableQuestion) => void;
  onQuestionDelete: (clientId: string, serverId: string | null) => void;
}

export function ActiveQuestionPane({
  activeQuestion,
  mobileView,
  readOnly,
  onMobileViewChange,
  onQuestionChange,
  onQuestionDelete,
}: ActiveQuestionPaneProps) {
  return (
    <aside
      className={[
        "flex-1 rounded-md border border-bsy-stone-100 bg-white p-4 md:max-w-[560px] md:p-6",
        mobileView === "list" ? "hidden md:block" : "block",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onMobileViewChange("list")}
          className="text-[13px] font-bold text-bsy-forest md:hidden"
        >
          → חזרה
        </button>
        <h2 className="font-[var(--font-display)] text-xl text-bsy-brown">
          {activeQuestion
            ? `תחנה ${activeQuestion.ordinal}`
            : "אין תחנות עדיין"}
        </h2>
        <span className="text-[11px] text-bsy-stone-400">
          {activeQuestion ? QUESTION_TYPE_LABELS[activeQuestion.type] : null}
        </span>
      </div>

      {activeQuestion ? (
        <QuestionEditor
          key={activeQuestion.clientId}
          question={activeQuestion}
          onChange={onQuestionChange}
          onDelete={
            readOnly
              ? undefined
              : () =>
                  onQuestionDelete(activeQuestion.clientId, activeQuestion.id)
          }
          readOnly={readOnly}
        />
      ) : (
        <p className="text-[13px] text-bsy-stone-700">
          לחצו “+ הוספת תחנה” כדי להתחיל.
        </p>
      )}
    </aside>
  );
}
