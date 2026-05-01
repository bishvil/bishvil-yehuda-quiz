"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import {
  createAdminSession,
  getAdminQuiz,
  isAdminApiError,
  listAdminSessions,
  type AdminQuizDetail,
  type AdminSessionListRow,
} from "@/src/lib/admin/api-client";
import {
  GAME_MODE_LABELS,
  SESSION_STATUS_LABELS,
} from "@/src/lib/constants";

const STATUS_TONE: Record<AdminSessionListRow["status"], string> = {
  draft: "bg-bsy-stone-50 text-bsy-stone-700",
  scheduled: "bg-bsy-info/10 text-bsy-info",
  live: "bg-bsy-lime/20 text-bsy-forest",
  paused: "bg-bsy-warn/15 text-bsy-warn",
  ended: "bg-bsy-stone-100 text-bsy-stone-700",
};

export function SessionsScreen({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<AdminQuizDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSessionListRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      const [quizBody, sessionsBody] = await Promise.all([
        getAdminQuiz(quizId),
        listAdminSessions(quizId),
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
      setQuiz(quizBody.quiz);
      setSessions(sessionsBody.sessions);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const handleLaunch = useCallback(async () => {
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
  }, [quizId]);

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
            disabled={launching || status !== "ready"}
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

      <section className="flex-1 px-4 py-6 md:px-8">
        {status === "loading" ? (
          <div className="text-bsy-stone-700">טוען…</div>
        ) : sessions.length === 0 ? (
          <EmptyState onLaunch={handleLaunch} launching={launching} />
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
}: {
  onLaunch: () => void;
  launching: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-bsy-stone-200 bg-white px-6 py-16 text-center">
      <h2 className="font-[var(--font-display)] text-2xl text-bsy-brown">
        אין משחקים פעילים
      </h2>
      <p className="text-[13px] text-bsy-stone-700">
        ההפעלה תיצור קוד הצטרפות ותעביר את החידון למצב “מתוזמן”.
      </p>
      <PrimaryButton onClick={onLaunch} withArrow disabled={launching}>
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
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[session.status]}`}
          >
            {SESSION_STATUS_LABELS[session.status]}
          </span>
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
