"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuestionReorder } from "@/src/hooks/useQuestionReorder";
import {
  createAdminQuestion,
  createAdminSession,
  deleteAdminQuestion,
  duplicateAdminQuiz,
  getAdminQuiz,
  isAdminApiError,
  listAdminQuestions,
  reorderAdminQuestions,
  updateAdminQuestion,
  updateAdminQuiz,
} from "@/src/lib/admin/api-client";
import {
  buildQuizSavePayload,
  makeBlankQuestion,
  type EditableQuestion,
  type EditableQuiz,
} from "@/src/lib/admin/quiz-editor";
import { useDebouncedAutoSave } from "@/src/lib/hooks/useDebouncedAutoSave";

import {
  buildQuestionCreateRequest,
  buildQuestionUpdateRequest,
  isOrdinalOnlyChange,
  removeQuestionFromList,
  rowToEditable,
  type QuizEditorMobileView,
  type QuizEditorStatus,
} from "./quiz-editor-utils";

export function useQuizEditorController(quizId: string) {
  const router = useRouter();
  const [status, setStatus] = useState<QuizEditorStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<EditableQuiz | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileView, setMobileView] = useState<QuizEditorMobileView>("list");
  const [launching, setLaunching] = useState(false);
  const [hasAnySession, setHasAnySession] = useState(false);
  const [lockedEditingEnabled, setLockedEditingEnabled] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [questionsAutosaveEnabled, setQuestionsAutosaveEnabled] =
    useState(false);

  const initialQuestionsLoadedRef = useRef(false);
  const previousSnapshotRef = useRef<EditableQuestion[] | null>(null);
  const questionsSaveInflightRef = useRef<Promise<void> | null>(null);
  const serverIdsByClientIdRef = useRef<Map<string, string>>(new Map());

  const readOnly = hasAnySession && !lockedEditingEnabled;
  const allowLockedQuizEdit = hasAnySession && lockedEditingEnabled;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [quizBody, questionsBody] = await Promise.all([
        getAdminQuiz(quizId),
        listAdminQuestions(quizId),
      ]);
      if (cancelled) return;
      if (isAdminApiError(quizBody)) {
        setStatus("error");
        setErrorMessage(quizBody.message);
        return;
      }
      if (isAdminApiError(questionsBody)) {
        setStatus("error");
        setErrorMessage(questionsBody.message);
        return;
      }
      setQuiz({
        id: quizBody.quiz.id,
        title: quizBody.quiz.title,
        brandId: quizBody.quiz.brandId,
        defaultGameMode: quizBody.quiz.defaultGameMode,
        customLogo: quizBody.quiz.customLogo,
        customLogoLabel: quizBody.quiz.customLogoLabel,
        customLogoActive: quizBody.quiz.customLogoActive,
        joinFields: quizBody.quiz.joinFields,
        archivedAt: quizBody.quiz.archivedAt,
      });
      setHasAnySession(quizBody.quiz.hasAnySession);
      setLockedEditingEnabled(false);
      setQuestions(questionsBody.questions.map(rowToEditable));
      initialQuestionsLoadedRef.current = true;
      setQuestionsAutosaveEnabled(!quizBody.quiz.hasAnySession);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const saveQuiz = useCallback(
    async (next: EditableQuiz | null) => {
      if (!next) return;
      const body = await updateAdminQuiz(next.id, buildQuizSavePayload(next), {
        allowLockedQuizEdit,
      });
      if (isAdminApiError(body)) throw new Error(body.message);
    },
    [allowLockedQuizEdit],
  );

  const quizSave = useDebouncedAutoSave({
    value: quiz,
    save: saveQuiz,
    enabled: status === "ready" && quiz !== null && !readOnly,
  });

  const runFullQuestionSave = useCallback(
    async (snapshot: EditableQuestion[]) => {
      for (const q of snapshot) {
        if (q.id === null) {
          const body = await createAdminQuestion(
            quizId,
            buildQuestionCreateRequest(q),
            { allowLockedQuizEdit },
          );
          if (isAdminApiError(body)) throw new Error(body.message);
          serverIdsByClientIdRef.current.set(q.clientId, body.question.id);
          setQuestions((prev) =>
            prev.map((row) =>
              row.clientId === q.clientId
                ? { ...row, id: body.question.id }
                : row,
            ),
          );
        } else {
          const body = await updateAdminQuestion(
            quizId,
            q.id,
            buildQuestionUpdateRequest(q),
            { allowLockedQuizEdit },
          );
          if (isAdminApiError(body)) throw new Error(body.message);
        }
      }
    },
    [allowLockedQuizEdit, quizId],
  );

  const saveQuestions = useCallback(
    async (snapshot: EditableQuestion[]) => {
      const previous = questionsSaveInflightRef.current;
      const work = (async () => {
        if (previous) {
          try {
            await previous;
          } catch {
            // This attempt has its own snapshot and will surface its own error.
          }
        }
        const prevSnapshot = previousSnapshotRef.current;
        if (isOrdinalOnlyChange(prevSnapshot, snapshot)) {
          const result = await reorderAdminQuestions(
            quizId,
            {
              ordinals: snapshot.map((q) => ({
                id: q.id!,
                ordinal: q.ordinal,
              })),
            },
            { allowLockedQuizEdit },
          );
          if (isAdminApiError(result)) throw new Error(result.message);
          previousSnapshotRef.current = snapshot;
          return;
        }
        await runFullQuestionSave(snapshot);
        previousSnapshotRef.current = snapshot;
      })();
      questionsSaveInflightRef.current = work;
      try {
        await work;
      } finally {
        if (questionsSaveInflightRef.current === work) {
          questionsSaveInflightRef.current = null;
        }
      }
    },
    [allowLockedQuizEdit, quizId, runFullQuestionSave],
  );

  const questionsSave = useDebouncedAutoSave({
    value: questions,
    save: saveQuestions,
    enabled: status === "ready" && questionsAutosaveEnabled && !readOnly,
  });

  const indicator = useMemo(() => {
    const states = [quizSave.status, questionsSave.status];
    if (states.includes("error")) return "error" as const;
    if (states.includes("saving")) return "saving" as const;
    if (states.includes("saved")) return "saved" as const;
    return "idle" as const;
  }, [quizSave.status, questionsSave.status]);

  const updateQuestion = useCallback((next: EditableQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.clientId === next.clientId ? next : q)),
    );
  }, []);

  const addQuestion = useCallback(() => {
    setQuestions((prev) => {
      const ordinal =
        prev.length === 0 ? 1 : Math.max(...prev.map((q) => q.ordinal)) + 1;
      const next = [...prev, makeBlankQuestion(ordinal)];
      setActiveIndex(next.length - 1);
      setMobileView("edit");
      return next;
    });
  }, []);

  const removeQuestion = useCallback(
    async (clientId: string, serverId: string | null) => {
      if (typeof window !== "undefined" && !window.confirm("למחוק את התחנה?")) {
        return;
      }
      try {
        await questionsSave.flush();
      } catch {
        setQuestions((prev) => {
          const next = removeQuestionFromList(prev, clientId);
          setActiveIndex((current) =>
            Math.min(current, Math.max(0, next.length - 1)),
          );
          return next;
        });
        return;
      }
      const resolvedServerId =
        serverIdsByClientIdRef.current.get(clientId) ?? serverId;
      if (resolvedServerId) {
        const body = await deleteAdminQuestion(quizId, resolvedServerId, {
          allowLockedQuizEdit,
        });
        if (isAdminApiError(body)) {
          setErrorMessage(body.message);
          return;
        }
      }
      setQuestions((prev) => {
        const next = removeQuestionFromList(prev, clientId);
        setActiveIndex((current) =>
          Math.min(current, Math.max(0, next.length - 1)),
        );
        return next;
      });
    },
    [allowLockedQuizEdit, quizId, questionsSave],
  );

  const { reorderQuestion } = useQuestionReorder({
    questions,
    onSave: setQuestions,
    onActiveIndexChange: setActiveIndex,
  });

  const handleDuplicate = useCallback(async () => {
    if (!quiz || duplicating) return;
    setDuplicating(true);
    setErrorMessage(null);
    const body = await duplicateAdminQuiz(quiz.id);
    if (isAdminApiError(body)) {
      setDuplicating(false);
      setErrorMessage(body.message);
      return;
    }
    router.push(`/admin/quizzes/${body.quiz.id}`);
  }, [quiz, duplicating, router]);

  const handleEnableLockedEditing = useCallback(() => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        "עריכת חידון שכבר יש לו משחקים תשפיע על השאלות ועל תוצאות משחקים קיימים. להמשיך לעריכה בכל זאת?",
      );
    if (!confirmed) return;
    setLockedEditingEnabled(true);
    setQuestionsAutosaveEnabled(true);
    setErrorMessage(null);
  }, []);

  const handleLaunch = useCallback(async () => {
    if (!quiz) return;
    if (questions.length === 0) {
      setErrorMessage("הוסיפו לפחות תחנה אחת לפני הפעלה.");
      return;
    }
    setLaunching(true);
    setErrorMessage(null);
    try {
      await quizSave.flush();
      await questionsSave.flush();
    } catch (caught) {
      setLaunching(false);
      setErrorMessage(
        caught instanceof Error ? caught.message : "השמירה לפני הפעלה נכשלה.",
      );
      return;
    }
    const body = await createAdminSession({ quizId: quiz.id });
    setLaunching(false);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    router.push(`/admin/quizzes/${quiz.id}/sessions`);
  }, [quiz, questions.length, quizSave, questionsSave, router]);

  return {
    status,
    errorMessage,
    quiz,
    setQuiz,
    questions,
    activeIndex,
    setActiveIndex,
    activeQuestion: questions[activeIndex] ?? null,
    mobileView,
    setMobileView,
    launching,
    hasAnySession,
    readOnly,
    duplicating,
    indicator,
    saveErrorMessage: quizSave.errorMessage ?? questionsSave.errorMessage,
    updateQuestion,
    addQuestion,
    removeQuestion,
    reorderQuestion,
    handleDuplicate,
    handleEnableLockedEditing,
    handleLaunch,
  };
}
