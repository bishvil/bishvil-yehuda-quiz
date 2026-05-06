"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import {
  archiveAdminQuiz,
  createAdminQuiz,
  duplicateAdminQuiz,
  hardDeleteAdminQuiz,
  isAdminApiError,
  listAdminQuizzes,
  unarchiveAdminQuiz,
  type AdminQuizListItem,
} from "@/src/lib/admin/api-client";
import { GAME_MODE_LABELS } from "@/src/lib/constants";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

const DEFAULT_QUIZ_TITLE = "חידון חדש";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface QuizListScreenProps {
  brands: ParticipantBrand[];
  defaultBrandId: string;
}

export function QuizListScreen({ brands, defaultBrandId }: QuizListScreenProps) {
  const [quizzes, setQuizzes] = useState<AdminQuizListItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      const body = await listAdminQuizzes();
      if (cancelled) return;
      if (isAdminApiError(body)) {
        setStatus("error");
        setErrorMessage(body.message);
        return;
      }
      setQuizzes(body.quizzes);
      setStatus("ready");
      setErrorMessage(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setErrorMessage(null);
    const body = await createAdminQuiz({
      brandId: defaultBrandId,
      title: DEFAULT_QUIZ_TITLE,
      defaultGameMode: "sync",
    });
    setCreating(false);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    // Optimistic prepend then navigate.
    setQuizzes((prev) => [body.quiz, ...prev]);
    if (typeof window !== "undefined") {
      window.location.href = `/admin/quizzes/${body.quiz.id}`;
    }
  }, [defaultBrandId]);

  const handleArchive = useCallback(async (quizId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("לארכב את החידון? משחקים פעילים ימשיכו לרוץ.")
    ) {
      return;
    }
    const body = await archiveAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId ? { ...q, archivedAt: body.archivedAt } : q,
      ),
    );
  }, []);

  const handleHardDelete = useCallback(async (quizId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "למחוק לצמיתות? פעולה זו אינה הפיכה. החידון וכל התחנות שלו יימחקו.",
      )
    ) {
      return;
    }
    const body = await hardDeleteAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
  }, []);

  const handleDuplicate = useCallback(async (quizId: string) => {
    setErrorMessage(null);
    const body = await duplicateAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    if (typeof window !== "undefined") {
      window.location.href = `/admin/quizzes/${body.quiz.id}`;
    }
  }, []);

  const handleUnarchive = useCallback(async (quizId: string) => {
    const body = await unarchiveAdminQuiz(quizId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === quizId ? { ...q, archivedAt: null } : q,
      ),
    );
  }, []);

  const visible = showArchived
    ? quizzes
    : quizzes.filter((q) => q.archivedAt === null);

  return (
    <>
      <AdminTopBar
        crumbs={[{ label: "החידונים שלי" }]}
        tools={
          <>
            <label className="flex items-center gap-2 text-[12px] text-bsy-stone-700">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-bsy-forest"
              />
              <span>הצג מאורכבים</span>
            </label>
            <PrimaryButton
              onClick={handleCreate}
              disabled={creating}
              withArrow
              variant="primary"
              data-testid="admin-create-quiz"
            >
              {creating ? "יוצר…" : "חידון חדש"}
            </PrimaryButton>
          </>
        }
      />

      <section className="flex-1 px-4 py-6 md:px-8">
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error">
            {errorMessage}
          </div>
        ) : null}

        {status === "loading" && quizzes.length === 0 ? (
          <Skeleton />
        ) : visible.length === 0 ? (
          <EmptyState onCreate={handleCreate} creating={creating} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((quiz) => (
              <li key={quiz.id}>
                <QuizCard
                  quiz={quiz}
                  brands={brands}
                  onArchive={() => handleArchive(quiz.id)}
                  onUnarchive={() => handleUnarchive(quiz.id)}
                  onHardDelete={() => handleHardDelete(quiz.id)}
                  onDuplicate={() => handleDuplicate(quiz.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-[120px] animate-pulse rounded-md border border-bsy-stone-100 bg-white"
        />
      ))}
    </div>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-bsy-stone-200 bg-white px-6 py-16 text-center">
      <div>
        <h2 className="font-[var(--font-display)] text-2xl text-bsy-brown">
          אין חידונים עדיין
        </h2>
        <p className="mt-1 text-[13px] text-bsy-stone-700">
          התחילו ביצירת חידון חדש — תוכלו להוסיף תחנות בעמוד העריכה.
        </p>
      </div>
      <PrimaryButton onClick={onCreate} withArrow disabled={creating}>
        {creating ? "יוצר…" : "צור חידון ראשון"}
      </PrimaryButton>
    </div>
  );
}

function QuizCard({
  quiz,
  brands,
  onArchive,
  onUnarchive,
  onHardDelete,
  onDuplicate,
}: {
  quiz: AdminQuizListItem;
  brands: ParticipantBrand[];
  onArchive: () => void;
  onUnarchive: () => void;
  onHardDelete: () => void;
  onDuplicate: () => void;
}) {
  const archived = quiz.archivedAt !== null;
  const sessionCount = quiz.sessionCount ?? 0;
  const canHardDelete = archived && sessionCount === 0;
  const locked = sessionCount > 0;
  return (
    <article
      className={[
        "flex h-full flex-col justify-between rounded-md border bg-white p-4 shadow-[var(--shadow-xs)] transition-colors",
        archived
          ? "border-bsy-stone-100 opacity-60"
          : "border-bsy-stone-100 hover:border-bsy-forest",
      ].join(" ")}
      data-testid="admin-quiz-card"
    >
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
          <span>{GAME_MODE_LABELS[quiz.defaultGameMode]}</span>
          {archived ? (
            <span className="rounded bg-bsy-stone-100 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-bsy-stone-500">
              בארכיון
            </span>
          ) : null}
        </div>
        <h3 className="font-[var(--font-display)] text-xl text-bsy-brown">
          {quiz.title}
        </h3>
        <p className="mt-1 text-[12px] text-bsy-stone-700">
          {typeof quiz.questionCount === "number"
            ? `${quiz.questionCount} תחנות`
            : "—"}
          <span className="px-1">·</span>
          <span>{brands.find((b) => b.id === quiz.brandId)?.name ?? quiz.brandId}</span>
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          href={`/admin/quizzes/${quiz.id}`}
          className="text-[13px] font-bold text-bsy-forest hover:underline"
        >
          {locked ? "צפייה ←" : "עריכה ←"}
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/quizzes/${quiz.id}/sessions`}
            className="text-[12px] text-bsy-stone-700 hover:text-bsy-forest"
          >
            משחקים
          </Link>
          <button
            type="button"
            onClick={onDuplicate}
            className="text-[12px] text-bsy-stone-700 hover:text-bsy-forest"
            data-testid="admin-duplicate-quiz"
            title="צור עותק זמין לעריכה"
          >
            שכפל
          </button>
          {archived ? (
            <>
              <button
                type="button"
                onClick={onUnarchive}
                className="text-[12px] text-bsy-forest hover:underline"
              >
                שחזר
              </button>
              <button
                type="button"
                onClick={onHardDelete}
                disabled={!canHardDelete}
                title={
                  canHardDelete
                    ? undefined
                    : "לא ניתן למחוק חידון עם משחקים"
                }
                className="rounded border border-bsy-error/40 px-2 py-0.5 text-[12px] text-bsy-error hover:bg-bsy-error/10 disabled:cursor-not-allowed disabled:border-bsy-stone-200 disabled:text-bsy-stone-400 disabled:hover:bg-transparent"
                data-testid="admin-hard-delete-quiz"
              >
                מחק לצמיתות
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onArchive}
              className="text-[12px] text-bsy-stone-400 hover:text-bsy-error"
            >
              ארכוב
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
