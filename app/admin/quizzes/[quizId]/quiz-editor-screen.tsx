"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { QuestionEditor } from "@/src/components/admin/QuestionEditor";
import { SaveIndicator } from "@/src/components/admin/SaveIndicator";
import { SortableQuestionCard } from "@/src/components/admin/SortableQuestionCard";
import { SortableQuestionList } from "@/src/components/admin/SortableQuestionList";
import { LogoUploader } from "@/src/components/admin/upload/LogoUploader";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { useQuestionReorder } from "@/src/hooks/useQuestionReorder";
import { GAME_MODES, QUESTION_TYPE_LABELS, type GameMode } from "@/src/lib/constants";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import {
  createAdminQuestion,
  createAdminSession,
  deleteAdminQuestion,
  getAdminQuiz,
  isAdminApiError,
  listAdminQuestions,
  reorderAdminQuestions,
  updateAdminQuestion,
  updateAdminQuiz,
  type AdminQuestionListItem,
} from "@/src/lib/admin/api-client";
import {
  buildQuizSavePayload,
  makeBlankQuestion,
  nextClientId,
  type EditableQuestion,
  type EditableQuiz,
} from "@/src/lib/admin/quiz-editor";
import { useDebouncedAutoSave } from "@/src/lib/hooks/useDebouncedAutoSave";

interface Props {
  quizId: string;
  brands: ParticipantBrand[];
}

type Status = "loading" | "ready" | "error";

function rowToEditable(row: AdminQuestionListItem): EditableQuestion {
  return {
    id: row.id,
    clientId: nextClientId(),
    ordinal: row.ordinal,
    type: row.type,
    prompt: row.prompt,
    options: row.options ?? null,
    correctIds: row.correctIds ?? null,
    map: row.map ?? null,
    imageUrl: row.imageUrl ?? null,
    explanation: row.explanation ?? null,
    timeSeconds: row.timeSeconds,
    points: row.points,
  };
}

export function QuizEditorScreen({ quizId, brands }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<EditableQuiz | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Mobile two-pane: list | edit. */
  const [mobileView, setMobileView] = useState<"list" | "edit">("list");
  const [launching, setLaunching] = useState(false);

  const initialQuestionsLoadedRef = useRef(false);
  const [questionsAutosaveEnabled, setQuestionsAutosaveEnabled] =
    useState(false);
  const previousSnapshotRef = useRef<EditableQuestion[] | null>(null);
  // Serialize question saves so rapid drags don't race overlapping PUTs
  // against the UNIQUE(quiz_id, ordinal) constraint. The latest snapshot
  // always wins because `useDebouncedAutoSave.performSave` reads the
  // current `valueRef.current` when its turn arrives.
  const questionsSaveInflightRef = useRef<Promise<void> | null>(null);
  // Synchronously updated map from clientId → server id, stamped the
  // moment the POST response arrives (before the React re-render fires).
  // This lets removeQuestion read the real server id after flush() even
  // though the questions state update hasn't been committed to the tree yet.
  const serverIdsByClientIdRef = useRef<Map<string, string>>(new Map());

  // ---- Initial load ----------------------------------------------------
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
      setQuestions(questionsBody.questions.map(rowToEditable));
      initialQuestionsLoadedRef.current = true;
      setQuestionsAutosaveEnabled(true);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // ---- Auto-save: quiz metadata ---------------------------------------
  // See `buildQuizSavePayload` for the payload shape rationale (Wave-2
  // review M1: brand changes were dropped and nullable logo fields could
  // not be cleared because the previous closure spread truthy-only).
  const saveQuiz = useCallback(async (next: EditableQuiz | null) => {
    if (!next) return;
    const body = await updateAdminQuiz(next.id, buildQuizSavePayload(next));
    if (isAdminApiError(body)) {
      throw new Error(body.message);
    }
  }, []);

  const quizSave = useDebouncedAutoSave({
    value: quiz,
    save: saveQuiz,
    enabled: status === "ready" && quiz !== null,
  });

  // Detects reorder-only changes: same set of question IDs (no add/remove,
  // no unsaved blanks) and every per-question field except `ordinal` is
  // identical. When true, we can use the atomic bulk reorder endpoint
  // instead of a serial PUT loop that can collide on
  // UNIQUE(quiz_id, ordinal) under rapid drags. [QA-19]
  const isOrdinalOnlyChange = (
    prev: EditableQuestion[] | null,
    next: EditableQuestion[],
  ): boolean => {
    if (!prev || prev.length !== next.length) {
      return false;
    }
    if (next.some((q) => q.id === null)) {
      return false;
    }
    const prevById = new Map<string, EditableQuestion>();
    for (const row of prev) {
      if (row.id === null) return false;
      prevById.set(row.id, row);
    }
    let ordinalDiff = false;
    for (const row of next) {
      const prevRow = prevById.get(row.id!);
      if (!prevRow) return false;
      if (prevRow.ordinal !== row.ordinal) {
        ordinalDiff = true;
      }
      if (
        prevRow.type !== row.type ||
        prevRow.prompt !== row.prompt ||
        prevRow.timeSeconds !== row.timeSeconds ||
        prevRow.points !== row.points ||
        prevRow.imageUrl !== row.imageUrl ||
        prevRow.explanation !== row.explanation ||
        JSON.stringify(prevRow.options) !== JSON.stringify(row.options) ||
        JSON.stringify(prevRow.correctIds) !== JSON.stringify(row.correctIds) ||
        JSON.stringify(prevRow.map) !== JSON.stringify(row.map)
      ) {
        return false;
      }
    }
    return ordinalDiff;
  };

  // ---- Auto-save: questions ------------------------------------------
  const runFullQuestionSave = useCallback(
    async (snapshot: EditableQuestion[]) => {
      // We need to commit each question individually. New ones get POSTed,
      // existing ones get PUTed. We do this serially so the UI shows
      // ordinal swaps consistently (and to avoid hammering the API).
      for (const q of snapshot) {
        if (q.id === null) {
          const body = await createAdminQuestion(quizId, {
            ordinal: q.ordinal,
            type: q.type,
            prompt: q.prompt,
            ...(q.options ? { options: q.options } : {}),
            ...(q.correctIds ? { correctIds: q.correctIds } : {}),
            ...(q.map ? { map: q.map } : {}),
            ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
            ...(q.explanation ? { explanation: q.explanation } : {}),
            timeSeconds: q.timeSeconds,
            points: q.points,
          });
          if (isAdminApiError(body)) {
            throw new Error(body.message);
          }
          // Stamp synchronously into the ref so removeQuestion can read the
          // server id immediately after flush() — before the React state
          // update has propagated through the render cycle.
          serverIdsByClientIdRef.current.set(q.clientId, body.question.id);
          // Also stamp the server id onto the local row so subsequent saves PUT.
          setQuestions((prev) =>
            prev.map((row) =>
              row.clientId === q.clientId
                ? { ...row, id: body.question.id }
                : row,
            ),
          );
        } else {
          const body = await updateAdminQuestion(quizId, q.id, {
            ordinal: q.ordinal,
            type: q.type,
            prompt: q.prompt,
            options: q.options ?? undefined,
            correctIds: q.correctIds ?? undefined,
            map: q.map ?? undefined,
            imageUrl: q.imageUrl ?? undefined,
            explanation: q.explanation ?? undefined,
            timeSeconds: q.timeSeconds,
            points: q.points,
          });
          if (isAdminApiError(body)) {
            throw new Error(body.message);
          }
        }
      }
    },
    [quizId],
  );

  const saveQuestions = useCallback(
    async (snapshot: EditableQuestion[]) => {
      // Serialize against any in-flight save so rapid drags can't produce
      // overlapping write loops that race on UNIQUE(quiz_id, ordinal).
      // The latest snapshot supplied by `useDebouncedAutoSave.performSave`
      // wins because it reads `valueRef.current` when its turn arrives. [QA-19]
      const previous = questionsSaveInflightRef.current;
      const work = (async () => {
        if (previous) {
          try {
            await previous;
          } catch {
            // Swallow upstream failure — this attempt has its own snapshot
            // and will surface its own error if it fails.
          }
        }
        const prevSnapshot = previousSnapshotRef.current;

        // Reorder-only change → use the atomic bulk endpoint instead of
        // a serial PUT loop. The server normalizes ordinals 1..N inside a
        // single transaction (see app/api/admin/quizzes/[id]/questions/reorder).
        if (isOrdinalOnlyChange(prevSnapshot, snapshot)) {
          const reorderPayload = snapshot.map((q) => ({
            id: q.id!,
            ordinal: q.ordinal,
          }));
          const result = await reorderAdminQuestions(quizId, {
            ordinals: reorderPayload,
          });
          if (isAdminApiError(result)) {
            throw new Error(result.message);
          }
          // Only commit the snapshot after the write succeeds, otherwise
          // a failed save would corrupt the diff baseline for the retry.
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
    [quizId, runFullQuestionSave],
  );

  const questionsSave = useDebouncedAutoSave({
    value: questions,
    save: saveQuestions,
    enabled: status === "ready" && questionsAutosaveEnabled,
  });

  // Combined indicator status — if either is saving/error/saved, surface it.
  const indicator = useMemo(() => {
    const states = [quizSave.status, questionsSave.status];
    if (states.includes("error")) return "error" as const;
    if (states.includes("saving")) return "saving" as const;
    if (states.includes("saved")) return "saved" as const;
    return "idle" as const;
  }, [quizSave.status, questionsSave.status]);

  // ---- Question CRUD --------------------------------------------------
  const updateQuestion = useCallback((next: EditableQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.clientId === next.clientId ? next : q)),
    );
  }, []);

  const addQuestion = useCallback(() => {
    setQuestions((prev) => {
      const ordinal =
        prev.length === 0 ? 1 : Math.max(...prev.map((q) => q.ordinal)) + 1;
      const blank = makeBlankQuestion(ordinal);
      const next = [...prev, blank];
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

      // Flush any pending or in-flight autosave so the POST for a newly-added
      // question completes before we decide whether to call DELETE.
      try {
        await questionsSave.flush();
      } catch {
        // The POST failed — the question was never persisted on the server.
        // Drop the row locally and return without issuing a DELETE.
        setQuestions((prev) => {
          const next = prev
            .filter((q) => q.clientId !== clientId)
            .map((q, idx) => ({ ...q, ordinal: idx + 1 }));
          setActiveIndex((current) =>
            Math.min(current, Math.max(0, next.length - 1)),
          );
          return next;
        });
        return;
      }

      // After the flush, the POST may have resolved and stamped the server id
      // into serverIdsByClientIdRef synchronously — read it here, falling
      // back to the original closure value (for questions that were already
      // persisted before this call).
      const resolvedServerId =
        serverIdsByClientIdRef.current.get(clientId) ?? serverId;

      if (resolvedServerId) {
        const body = await deleteAdminQuestion(quizId, resolvedServerId);
        if (isAdminApiError(body)) {
          setErrorMessage(body.message);
          return;
        }
      }
      setQuestions((prev) => {
        const next = prev
          .filter((q) => q.clientId !== clientId)
          .map((q, idx) => ({ ...q, ordinal: idx + 1 }));
        setActiveIndex((current) =>
          Math.min(current, Math.max(0, next.length - 1)),
        );
        return next;
      });
    },
    [quizId, questionsSave],
  );

  const { reorderQuestion } = useQuestionReorder({
    questions,
    onSave: setQuestions,
    onActiveIndexChange: setActiveIndex,
  });

  // ---- Launch session -------------------------------------------------
  const handleLaunch = useCallback(async () => {
    if (!quiz) return;
    if (questions.length === 0) {
      setErrorMessage("הוסיפו לפחות תחנה אחת לפני הפעלה.");
      return;
    }
    setLaunching(true);
    setErrorMessage(null);
    // Make sure outstanding edits are committed first.
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

  // ---- Render ---------------------------------------------------------
  if (status === "loading") {
    return (
      <>
        <AdminTopBar
          crumbs={[{ label: "החידונים שלי", href: "/admin/quizzes" }]}
        />
        <div className="px-6 py-12 text-bsy-stone-700">טוען…</div>
      </>
    );
  }
  if (status === "error" || !quiz) {
    return (
      <>
        <AdminTopBar
          crumbs={[{ label: "החידונים שלי", href: "/admin/quizzes" }]}
        />
        <div className="px-6 py-12 text-bsy-error">
          {errorMessage ?? "שגיאה בטעינת החידון."}
        </div>
      </>
    );
  }

  const activeQuestion = questions[activeIndex] ?? null;

  return (
    <>
      <AdminTopBar
        crumbs={[
          { label: "החידונים שלי", href: "/admin/quizzes" },
          { label: quiz.title },
        ]}
        tools={
          <>
            <SaveIndicator
              status={indicator}
              errorMessage={quizSave.errorMessage ?? questionsSave.errorMessage}
            />
            <Link
              href={`/admin/quizzes/${quiz.id}/sessions`}
              className="rounded-full border border-bsy-stone-200 bg-white px-4 py-1.5 text-[13px] font-bold text-bsy-stone-700 hover:border-bsy-forest"
            >
              משחקים
            </Link>
            <PrimaryButton
              onClick={handleLaunch}
              withArrow
              disabled={launching}
              data-testid="admin-launch-session"
            >
              {launching ? "מפעיל…" : "הפעלת חידון"}
            </PrimaryButton>
          </>
        }
      />

      {errorMessage ? (
        <div className="mx-4 mt-3 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error md:mx-6">
          {errorMessage}
        </div>
      ) : null}

      {/* Desktop: two-column. Mobile: list ↔ edit toggle */}
      <div className="flex flex-1 flex-col gap-6 px-4 py-4 md:flex-row md:px-6 md:py-6">
        {/* Question list + meta — hidden on mobile when in 'edit' mode */}
        <section
          className={[
            "flex-1 md:max-w-[560px]",
            mobileView === "edit" ? "hidden md:block" : "block",
          ].join(" ")}
        >
          <QuizMetaCard quiz={quiz} onChange={setQuiz} disabled={launching} brands={brands} />
          <h3 className="mt-6 mb-3 text-[12px] font-bold uppercase tracking-[0.16em] text-bsy-stone-400">
            {questions.length} תחנות
          </h3>
          <SortableQuestionList
            items={questions.map((q) => q.clientId)}
            onReorder={reorderQuestion}
            className="flex flex-col gap-2"
          >
            {questions.map((q, i) => (
              <SortableQuestionCard key={q.clientId} id={q.clientId}>
                <QuestionRow
                  question={q}
                  index={i}
                  active={i === activeIndex && mobileView !== "edit"}
                  onSelect={() => {
                    setActiveIndex(i);
                    setMobileView("edit");
                  }}
                />
              </SortableQuestionCard>
            ))}
          </SortableQuestionList>
          <button
            type="button"
            onClick={addQuestion}
            className="mt-3 w-full rounded-md border border-dashed border-bsy-stone-200 bg-white px-4 py-3 text-[13px] font-bold text-bsy-forest hover:border-bsy-forest"
            data-testid="admin-add-question"
          >
            + הוספת תחנה
          </button>
        </section>

        {/* Editor pane — hidden on mobile when in 'list' mode */}
        <aside
          className={[
            "flex-1 rounded-md border border-bsy-stone-100 bg-white p-4 md:max-w-[560px] md:p-6",
            mobileView === "list" ? "hidden md:block" : "block",
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMobileView("list")}
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
              {activeQuestion
                ? QUESTION_TYPE_LABELS[activeQuestion.type]
                : null}
            </span>
          </div>

          {activeQuestion ? (
            <QuestionEditor
              key={activeQuestion.clientId}
              question={activeQuestion}
              onChange={updateQuestion}
              onDelete={() =>
                removeQuestion(activeQuestion.clientId, activeQuestion.id)
              }
            />
          ) : (
            <p className="text-[13px] text-bsy-stone-700">
              לחצו “+ הוספת תחנה” כדי להתחיל.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

// ----- Subcomponents ---------------------------------------------------

const JOIN_FIELD_OPTIONS: { id: string; label: string }[] = [
  { id: "name", label: "שם" },
  { id: "phone", label: "טלפון" },
  { id: "unit", label: "יחידה" },
  { id: "team", label: "צוות" },
];

function QuizMetaCard({
  quiz,
  onChange,
  disabled,
  brands,
}: {
  quiz: EditableQuiz;
  onChange: (next: EditableQuiz) => void;
  disabled?: boolean;
  brands: ParticipantBrand[];
}) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white p-4 md:p-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          שם החידון
        </span>
        <input
          className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
          value={quiz.title}
          maxLength={80}
          onChange={(event) => onChange({ ...quiz, title: event.target.value })}
          disabled={disabled}
          data-testid="admin-quiz-title"
        />
      </label>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            מצב משחק
          </span>
          <select
            className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
            value={quiz.defaultGameMode}
            onChange={(event) =>
              onChange({
                ...quiz,
                defaultGameMode: event.target.value as GameMode,
              })
            }
            disabled={disabled}
          >
            {GAME_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "sync" ? "סינכרוני (מודרך)" : "אסינכרוני (חופשי)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
            מותג
          </span>
          <select
            className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]"
            value={quiz.brandId}
            onChange={(event) =>
              onChange({ ...quiz, brandId: event.target.value })
            }
            disabled={disabled}
          >
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          שדות הצטרפות
        </legend>
        <div className="flex flex-wrap gap-2">
          {JOIN_FIELD_OPTIONS.map((field) => {
            const checked = quiz.joinFields.includes(field.id);
            const disabledLocked = field.id === "phone";
            return (
              <label
                key={field.id}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]",
                  checked
                    ? "border-bsy-forest bg-bsy-forest/10 text-bsy-forest"
                    : "border-bsy-stone-200 bg-white text-bsy-stone-700",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || disabledLocked}
                  onChange={(event) => {
                    const set = new Set(quiz.joinFields);
                    if (event.target.checked) set.add(field.id);
                    else set.delete(field.id);
                    if (!set.has("phone")) set.add("phone"); // never drop phone
                    onChange({ ...quiz, joinFields: Array.from(set) });
                  }}
                  className="h-3.5 w-3.5 accent-bsy-forest"
                />
                <span>{field.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-md border border-bsy-stone-100 p-3">
        <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-bsy-stone-700">
          מיתוג ייעודי
        </legend>
        <div className="mt-2 grid gap-2">
          <label
            className={[
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] w-fit",
              quiz.customLogoActive
                ? "border-bsy-forest bg-bsy-forest/10 text-bsy-forest"
                : "border-bsy-stone-200 bg-white text-bsy-stone-700",
            ].join(" ")}
          >
            <input
              type="checkbox"
              checked={quiz.customLogoActive}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...quiz, customLogoActive: event.target.checked })
              }
              className="h-3.5 w-3.5 accent-bsy-forest"
            />
            <span>פעיל</span>
          </label>
          <p className="text-[11px] text-bsy-stone-400">
            כשפעיל — הלוגו הייעודי מופיע במסך ההצטרפות, בלוח החי ובלוח התוצאות
          </p>
          <div className={quiz.customLogoActive ? undefined : "opacity-60"}>
            <LogoUploader
              value={quiz.customLogo}
              onChange={(customLogo) =>
                onChange({
                  ...quiz,
                  customLogo,
                  customLogoLabel: customLogo ? quiz.customLogoLabel : null,
                })
              }
              disabled={disabled || !quiz.customLogoActive}
            />
          </div>
          <input
            className={[
              "rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px]",
              quiz.customLogoActive && quiz.customLogo !== null ? "" : "opacity-60",
            ].join(" ")}
            placeholder="שם האירוע (לדוגמה: גדוד 890)"
            value={quiz.customLogoLabel ?? ""}
            onChange={(event) =>
              onChange({
                ...quiz,
                customLogoLabel: event.target.value || null,
              })
            }
            disabled={disabled || !quiz.customLogoActive || quiz.customLogo === null}
          />
        </div>
      </fieldset>
    </div>
  );
}

function QuestionRow({
  question,
  index,
  active,
  onSelect,
  onMoveUp,
  onMoveDown,
}: {
  question: EditableQuestion;
  index: number;
  active: boolean;
  onSelect: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
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
