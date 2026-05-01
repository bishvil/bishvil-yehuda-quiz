"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { HostStatusPill } from "@/src/components/host/HostStatusPill";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import {
  createAdminSession,
  getAdminQuiz,
  isAdminApiError,
  listAdminQuestions,
  listAdminSessions,
  type AdminQuizDetail,
  type AdminSessionListRow,
} from "@/src/lib/admin/api-client";
import {
  SESSION_CREATE_HELPER,
  SESSION_PUBLISH_CONFIRM,
} from "@/src/lib/admin/lifecycle-copy";
import { GAME_MODE_LABELS } from "@/src/lib/constants";

export function SessionsScreen({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<AdminQuizDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSessionListRow[]>([]);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      const [quizBody, sessionsBody, questionsBody] = await Promise.all([
        getAdminQuiz(quizId),
        listAdminSessions(quizId),
        listAdminQuestions(quizId),
      ]);
      if (cancelled) return;
      if (isAdminApiError(quizBody)) {
        setStatus("error");
        setErrorMessage(quizBody.message);
        return;
      }
      if (isAdminApiError(sessionsBody)) {
        setStatus("error");
        setErrorMessage(sessionsBody.message);
        return;
      }
      if (isAdminApiError(questionsBody)) {
        setStatus("error");
        setErrorMessage(questionsBody.message);
        return;
      }
      setQuiz(quizBody.quiz);
      setSessions(sessionsBody.sessions);
      setQuestionCount(questionsBody.questions.length);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // ADR-0004 `draft → scheduled` requires at least one authored question.
  // The API also enforces this (Wave-2 review M2) — disabling here keeps
  // the affordance honest and matches the editor's launch button behavior.
  const hasQuestions = (questionCount ?? 0) > 0;
  const launchDisabled = launching || status !== "ready" || !hasQuestions;
  const emptyQuizMessage =
    "אי אפשר להפעיל חידון בלי תחנות — הוסיפו לפחות תחנה אחת בעורך.";

  const handleLaunch = useCallback(async () => {
    if (!hasQuestions) {
      setErrorMessage(emptyQuizMessage);
      return;
    }
    // Lifecycle clarity (subtask D §2): the user is about to flip the
    // session from draft → scheduled and it becomes joinable by code. The
    // confirm copy spells that out so accidental publishes are rare.
    if (typeof window !== "undefined") {
      const proceed = window.confirm(SESSION_PUBLISH_CONFIRM);
      if (!proceed) return;
    }
    setLaunching(true);
    setErrorMessage(null);
    const body = await createAdminSession({ quizId });
    setLaunching(false);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setSessions((prev) => [
      {
        id: body.session.id,
        pin: body.session.pin,
        quizId: body.session.quizId,
        status: body.session.status,
        gameMode: body.session.gameMode,
        autoReveal: body.session.autoReveal,
        startedAt: null,
        endedAt: body.session.endedAt,
        createdAt: body.session.createdAt,
      },
      ...prev,
    ]);
  }, [quizId, hasQuestions]);

  return (
    <>
      <AdminTopBar
        crumbs={[
          { label: "החידונים שלי", href: "/admin/quizzes" },
          { label: quiz?.title ?? "טוען…", href: `/admin/quizzes/${quizId}` },
          { label: "משחקים" },
        ]}
        tools={
          <PrimaryButton
            onClick={handleLaunch}
            withArrow
            disabled={launchDisabled}
            data-testid="admin-create-session"
          >
            {launching ? "מפעיל…" : "הפעלת חידון"}
          </PrimaryButton>
        }
      />

      {errorMessage ? (
        <div className="mx-4 mt-3 rounded-md border border-bsy-error/30 bg-bsy-error/10 px-4 py-2 text-[13px] text-bsy-error md:mx-6">
          {errorMessage}
        </div>
      ) : null}

      {status === "ready" && !hasQuestions ? (
        <div
          className="mx-4 mt-3 rounded-md border border-bsy-warn/40 bg-bsy-warn/10 px-4 py-2 text-[13px] text-bsy-warn md:mx-6"
          data-testid="admin-no-questions-warning"
          role="status"
        >
          {emptyQuizMessage}{" "}
          <Link
            href={`/admin/quizzes/${quizId}`}
            className="font-bold underline"
          >
            פתח עורך
          </Link>
        </div>
      ) : null}

      <p
        className="mx-4 mt-3 text-[12px] text-bsy-stone-700 md:mx-6"
        data-testid="admin-create-helper"
      >
        {SESSION_CREATE_HELPER}
      </p>

      <section className="flex-1 px-4 py-6 md:px-8">
        {status === "loading" ? (
          <div className="text-bsy-stone-700">טוען…</div>
        ) : sessions.length === 0 ? (
          <EmptyState
            onLaunch={handleLaunch}
            launching={launching}
            hasQuestions={hasQuestions}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} quizId={quizId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EmptyState({
  onLaunch,
  launching,
  hasQuestions,
}: {
  onLaunch: () => void;
  launching: boolean;
  hasQuestions: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-bsy-stone-200 bg-white px-6 py-16 text-center">
      <h2 className="font-[var(--font-display)] text-2xl text-bsy-brown">
        אין משחקים פעילים
      </h2>
      <p className="text-[13px] text-bsy-stone-700">
        ההפעלה תיצור קוד הצטרפות ותעביר את החידון למצב “מתוזמן”.
      </p>
      <PrimaryButton
        onClick={onLaunch}
        withArrow
        disabled={launching || !hasQuestions}
      >
        {launching ? "מפעיל…" : "הפעלת חידון"}
      </PrimaryButton>
    </div>
  );
}

function SessionCard({
  session,
  quizId,
}: {
  session: AdminSessionListRow;
  quizId: string;
}) {
  const created = new Date(session.createdAt);
  return (
    <article
      className="flex h-full flex-col justify-between rounded-md border border-bsy-stone-100 bg-white p-4 shadow-[var(--shadow-xs)]"
      data-testid="admin-session-card"
    >
      <div>
        <div className="flex items-center gap-2">
          <HostStatusPill status={session.status} />
          <span className="text-[11px] text-bsy-stone-400">
            {GAME_MODE_LABELS[session.gameMode]}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span
            className="font-[var(--font-display)] text-3xl text-bsy-brown"
            dir="ltr"
            data-testid="admin-session-pin"
          >
            {session.pin}
          </span>
          <span className="text-[11px] text-bsy-stone-400">
            נוצר{" "}
            {created.toLocaleString("he-IL", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-[13px]">
        <Link
          href={`/host/${session.pin}`}
          className="font-bold text-bsy-forest hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          לוח מנחה ←
        </Link>
        <Link
          href={`/admin/quizzes/${quizId}/sessions/${session.id}/results`}
          className="text-bsy-stone-700 hover:text-bsy-forest"
        >
          תוצאות
        </Link>
      </div>
    </article>
  );
}
