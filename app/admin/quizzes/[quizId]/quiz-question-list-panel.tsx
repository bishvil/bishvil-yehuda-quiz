"use client";

import type { UniqueIdentifier } from "@dnd-kit/core";

import { SortableQuestionCard } from "@/src/components/admin/SortableQuestionCard";
import { SortableQuestionList } from "@/src/components/admin/SortableQuestionList";
import type {
  EditableQuestion,
  EditableQuiz,
} from "@/src/lib/admin/quiz-editor";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

import type { QuizEditorMobileView } from "./quiz-editor-utils";
import { QuestionRow } from "./question-row";
import { QuizMetaCard } from "./quiz-meta-card";

interface QuizQuestionListPanelProps {
  quiz: EditableQuiz;
  brands: ParticipantBrand[];
  questions: EditableQuestion[];
  activeIndex: number;
  mobileView: QuizEditorMobileView;
  disabled: boolean;
  onQuizChange: (next: EditableQuiz) => void;
  onQuestionSelect: (index: number) => void;
  onAddQuestion: () => void;
  onReorder: (
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier | null | undefined,
  ) => EditableQuestion[] | null;
}

export function QuizQuestionListPanel({
  quiz,
  brands,
  questions,
  activeIndex,
  mobileView,
  disabled,
  onQuizChange,
  onQuestionSelect,
  onAddQuestion,
  onReorder,
}: QuizQuestionListPanelProps) {
  return (
    <section
      className={[
        "flex-1 md:max-w-[560px]",
        mobileView === "edit" ? "hidden md:block" : "block",
      ].join(" ")}
    >
      <QuizMetaCard
        quiz={quiz}
        onChange={onQuizChange}
        disabled={disabled}
        brands={brands}
      />
      <h3 className="mt-6 mb-3 text-[12px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400">
        {questions.length} תחנות
      </h3>
      <SortableQuestionList
        items={questions.map((q) => q.clientId)}
        onReorder={onReorder}
        className="flex flex-col gap-2"
        disabled={disabled}
      >
        {questions.map((q, i) => (
          <SortableQuestionCard key={q.clientId} id={q.clientId}>
            <QuestionRow
              question={q}
              index={i}
              active={i === activeIndex && mobileView !== "edit"}
              onSelect={() => onQuestionSelect(i)}
            />
          </SortableQuestionCard>
        ))}
      </SortableQuestionList>
      <button
        type="button"
        onClick={onAddQuestion}
        disabled={disabled}
        className="mt-3 w-full rounded-md border border-dashed border-bsy-stone-200 bg-white px-4 py-3 text-[13px] font-bold text-bsy-forest hover:border-bsy-forest disabled:cursor-not-allowed disabled:text-bsy-stone-400 disabled:hover:border-bsy-stone-200"
        data-testid="admin-add-question"
      >
        + הוספת תחנה
      </button>
    </section>
  );
}
