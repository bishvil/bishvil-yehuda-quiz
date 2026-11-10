"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ParticipantPreviewDialog } from "@/src/components/admin/ParticipantPreviewDialog";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { SaveIndicator } from "@/src/components/admin/SaveIndicator";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

import { ActiveQuestionPane } from "./active-question-pane";
import { LockedQuizEditBanner } from "./locked-quiz-edit-banner";
import { QuizQuestionListPanel } from "./quiz-question-list-panel";
import { useQuizEditorController } from "./use-quiz-editor-controller";

interface Props {
  quizId: string;
  brands: ParticipantBrand[];
}

export function QuizEditorScreen({ quizId, brands }: Props) {
  const editor = useQuizEditorController(quizId);
  const [previewQuestionId, setPreviewQuestionId] = useState<string | null>(
    null,
  );
  const closePreview = useCallback(() => setPreviewQuestionId(null), []);

  if (editor.status === "loading") {
    return (
      <>
        <AdminTopBar
          crumbs={[{ label: "החידונים שלי", href: "/admin/quizzes" }]}
        />
        <div className="px-6 py-12 text-bsy-stone-700">טוען…</div>
      </>
    );
  }

  if (editor.status === "error" || !editor.quiz) {
    return (
      <>
        <AdminTopBar
          crumbs={[{ label: "החידונים שלי", href: "/admin/quizzes" }]}
        />
        <div className="px-6 py-12 text-bsy-error">
          {editor.errorMessage ?? "שגיאה בטעינת החידון."}
        </div>
      </>
    );
  }

  const { quiz } = editor;

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
              status={editor.indicator}
              errorMessage={editor.saveErrorMessage}
            />
            <button
              type="button"
              disabled={!editor.activeQuestion}
              onClick={() =>
                setPreviewQuestionId(editor.activeQuestion?.clientId ?? null)
              }
              className="min-h-11 rounded-full border border-bsy-stone-200 bg-white px-4 py-2 text-[13px] font-bold text-bsy-forest hover:bg-bsy-paper-warm disabled:cursor-not-allowed disabled:text-bsy-stone-400"
            >
              תצוגת שחקן
            </button>
            <Link
              href={`/admin/quizzes/${quiz.id}/sessions`}
              className="rounded-full border border-bsy-stone-200 bg-white px-4 py-1.5 text-[13px] font-bold text-bsy-stone-700 hover:border-bsy-forest"
            >
              משחקים
            </Link>
            <PrimaryButton
              onClick={editor.handleLaunch}
              withArrow
              disabled={editor.launching || editor.readOnly}
              data-testid="admin-launch-session"
            >
              {editor.launching ? "יוצר משחק…" : "צור משחק"}
            </PrimaryButton>
          </>
        }
      />

      <LockedQuizEditBanner
        hasAnySession={editor.hasAnySession}
        readOnly={editor.readOnly}
        duplicating={editor.duplicating}
        onEnableLockedEditing={editor.handleEnableLockedEditing}
        onDuplicate={editor.handleDuplicate}
      />

      {editor.errorMessage ? (
        <div className="mx-4 mt-3 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error md:mx-6">
          {editor.errorMessage}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-6 px-4 py-4 md:flex-row md:px-6 md:py-6">
        <QuizQuestionListPanel
          quiz={quiz}
          brands={brands}
          questions={editor.questions}
          activeIndex={editor.activeIndex}
          mobileView={editor.mobileView}
          disabled={editor.readOnly || editor.launching}
          onQuizChange={editor.setQuiz}
          onQuestionSelect={(index) => {
            closePreview();
            editor.setActiveIndex(index);
            editor.setMobileView("edit");
          }}
          onAddQuestion={() => {
            closePreview();
            editor.addQuestion();
          }}
          onReorder={editor.reorderQuestion}
        />

        <ActiveQuestionPane
          activeQuestion={editor.activeQuestion}
          mobileView={editor.mobileView}
          readOnly={editor.readOnly}
          onMobileViewChange={editor.setMobileView}
          onQuestionChange={editor.updateQuestion}
          onQuestionDelete={(clientId, serverId) => {
            closePreview();
            void editor.removeQuestion(clientId, serverId);
          }}
        />
      </div>
      {editor.activeQuestion &&
      previewQuestionId === editor.activeQuestion.clientId ? (
        <ParticipantPreviewDialog
          key={editor.activeQuestion.clientId}
          question={editor.activeQuestion}
          quizTitle={quiz.title}
          stationCount={editor.questions.length}
          onClose={closePreview}
        />
      ) : null}
    </>
  );
}
