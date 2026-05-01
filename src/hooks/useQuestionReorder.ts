import { useCallback } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

export interface QuestionReorderItem {
  clientId: string;
  ordinal: number;
}

export interface UseQuestionReorderOptions<TQuestion extends QuestionReorderItem> {
  questions: TQuestion[];
  onSave: (questions: TQuestion[]) => void | Promise<void>;
  onActiveIndexChange?: (index: number) => void;
  getId?: (question: TQuestion) => UniqueIdentifier;
}

export interface UseQuestionReorderResult<TQuestion extends QuestionReorderItem> {
  reorderQuestion: (
    activeId: UniqueIdentifier,
    overId: UniqueIdentifier | null | undefined,
  ) => TQuestion[] | null;
  reorderQuestionByOffset: (
    activeId: UniqueIdentifier,
    offset: -1 | 1,
  ) => TQuestion[] | null;
}

function defaultGetId<TQuestion extends QuestionReorderItem>(
  question: TQuestion,
): UniqueIdentifier {
  return question.clientId;
}

function renumberQuestions<TQuestion extends QuestionReorderItem>(
  questions: TQuestion[],
): TQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    ordinal: index + 1,
  }));
}

export function moveQuestionById<TQuestion extends QuestionReorderItem>(
  questions: TQuestion[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier | null | undefined,
  getId: (question: TQuestion) => UniqueIdentifier = defaultGetId,
): TQuestion[] | null {
  if (overId === null || overId === undefined || activeId === overId) {
    return null;
  }

  const fromIndex = questions.findIndex((question) => getId(question) === activeId);
  const toIndex = questions.findIndex((question) => getId(question) === overId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return null;
  }

  return renumberQuestions(arrayMove(questions, fromIndex, toIndex));
}

export function moveQuestionByOffset<TQuestion extends QuestionReorderItem>(
  questions: TQuestion[],
  activeId: UniqueIdentifier,
  offset: -1 | 1,
  getId: (question: TQuestion) => UniqueIdentifier = defaultGetId,
): TQuestion[] | null {
  const fromIndex = questions.findIndex((question) => getId(question) === activeId);
  const toIndex = fromIndex + offset;

  if (fromIndex < 0 || toIndex < 0 || toIndex >= questions.length) {
    return null;
  }

  return renumberQuestions(arrayMove(questions, fromIndex, toIndex));
}

export function useQuestionReorder<TQuestion extends QuestionReorderItem>({
  questions,
  onSave,
  onActiveIndexChange,
  getId = defaultGetId,
}: UseQuestionReorderOptions<TQuestion>): UseQuestionReorderResult<TQuestion> {
  const saveReorder = useCallback(
    (nextQuestions: TQuestion[] | null, activeId: UniqueIdentifier) => {
      if (nextQuestions === null) {
        return null;
      }

      const activeIndex = nextQuestions.findIndex(
        (question) => getId(question) === activeId,
      );
      void onSave(nextQuestions);
      onActiveIndexChange?.(activeIndex);

      return nextQuestions;
    },
    [getId, onActiveIndexChange, onSave],
  );

  const reorderQuestion = useCallback(
    (activeId: UniqueIdentifier, overId: UniqueIdentifier | null | undefined) => {
      const nextQuestions = moveQuestionById(questions, activeId, overId, getId);
      return saveReorder(nextQuestions, activeId);
    },
    [getId, questions, saveReorder],
  );

  const reorderQuestionByOffset = useCallback(
    (activeId: UniqueIdentifier, offset: -1 | 1) => {
      const nextQuestions = moveQuestionByOffset(questions, activeId, offset, getId);
      return saveReorder(nextQuestions, activeId);
    },
    [getId, questions, saveReorder],
  );

  return { reorderQuestion, reorderQuestionByOffset };
}
