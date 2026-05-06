"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { HostStatusPill } from "@/src/components/host/HostStatusPill";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { SharePinPopover } from "@/src/components/share/SharePinPopover";
import {
  archiveAdminSession,
  createAdminSession,
  getAdminQuiz,
  hardDeleteAdminSession,
  isAdminApiError,
  listAdminQuestions,
  listAdminSessions,
  listAdminTeam,
  updateAdminSessionHost,
  type AdminQuizDetail,
  type AdminSessionListRow,
  type AdminTeamMember,
} from "@/src/lib/admin/api-client";
import {
  SESSION_CREATE_HELPER,
  SESSION_PUBLISH_CONFIRM,
} from "@/src/lib/admin/lifecycle-copy";
import { GAME_MODE_LABELS } from "@/src/lib/constants";
import { HOST_REASSIGNABLE_STATUSES } from "@/src/lib/sessions/state-machine";

export function SessionsScreen({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<AdminQuizDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSessionListRow[]>([]);
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [team, setTeam] = useState<AdminTeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus((prev) => (prev === "ready" ? prev : "loading"));
      const [quizBody, sessionsBody, questionsBody, teamBody] =
        await Promise.all([
          getAdminQuiz(quizId),
          listAdminSessions(quizId, showArchived),
          listAdminQuestions(quizId),
          listAdminTeam(),
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
      if (isAdminApiError(teamBody)) {
        setStatus("error");
        setErrorMessage(teamBody.message);
        return;
      }
      setQuiz(quizBody.quiz);
      setSessions(sessionsBody.sessions);
      setQuestionCount(questionsBody.questions.length);
      setTeam(teamBody.members);
      setCurrentUserId(teamBody.currentUserId);
      setSelectedHostId(teamBody.currentUserId);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, showArchived]);

  // ADR-0004 `draft → scheduled` requires at least one authored question.
  // The API also enforces this (Wave-2 review M2) — disabling here keeps
  // the affordance honest and matches the editor's launch button behavior.
  const hasQuestions = (questionCount ?? 0) > 0;
  const launchDisabled = launching || status !== "ready" || !hasQuestions;
  const emptyQuizMessage =
    "אי אפשר להפעיל חידון בלי תחנות — הוסיפו לפחות תחנה אחת בעורך.";

  const handleLaunch = useCallback(async () => {
    if (launchLockRef.current) return;
    if (!hasQuestions) {
      setErrorMessage(emptyQuizMessage);
      return;
    }
    if (typeof window !== "undefined") {
      const proceed = window.confirm(SESSION_PUBLISH_CONFIRM);
      if (!proceed) return;
    }
    launchLockRef.current = true;
    setLaunching(true);
    setErrorMessage(null);
    try {
      const body = await createAdminSession({
        quizId,
        hostUserId: selectedHostId || undefined,
      });
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
          hostId: body.session.hostId,
          hostEmail: body.session.hostEmail,
          startedAt: null,
          endedAt: body.session.endedAt,
          createdAt: body.session.createdAt,
          archivedAt: null,
        },
        ...prev,
      ]);
    } finally {
      setLaunching(false);
      launchLockRef.current = false;
    }
  }, [quizId, hasQuestions, selectedHostId]);

  const handleReassign = useCallback(
    async (sessionId: string, hostUserId: string) => {
      setErrorMessage(null);
      const body = await updateAdminSessionHost(sessionId, { hostUserId });
      if (isAdminApiError(body)) {
        setErrorMessage(body.message);
        return;
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? body.session : s)),
      );
    },
    [],
  );

  const handleArchive = useCallback(async (sessionId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("לארכב את המשחק? פעולה זו תסיים ותסתיר את המשחק מהרשימה.")
    ) {
      return;
    }
    setErrorMessage(null);
    const body = await archiveAdminSession(sessionId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    // If not showing archived, remove the row; otherwise update it with archivedAt.
    setSessions((prev) =>
      showArchived
        ? prev.map((s) =>
            s.id === sessionId ? { ...s, archivedAt: body.archivedAt } : s,
          )
        : prev.filter((s) => s.id !== sessionId),
    );
  }, [showArchived]);

  const handleHardDelete = useCallback(async (sessionId: string) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "למחוק לצמיתות? פעולה זו אינה הפיכה. המשחק וכל הנתונים שלו יימחקו.",
      )
    ) {
      return;
    }
    setErrorMessage(null);
    const body = await hardDeleteAdminSession(sessionId);
    if (isAdminApiError(body)) {
      setErrorMessage(body.message);
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  return (
    <>
      <AdminTopBar
        crumbs={[
          { label: "החידונים שלי", href: "/admin/quizzes" },
          { label: quiz?.title ?? "טוען…", href: `/admin/quizzes/${quizId}` },
          { label: "משחקים" },
        ]}
        tools={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-bsy-stone-700">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
                className="h-4 w-4 accent-bsy-forest"
              />
              <span>הצג מאורכבים</span>
            </label>
            <HostPicker
              members={team}
              value={selectedHostId}
              onChange={setSelectedHostId}
              currentUserId={currentUserId}
              disabled={status !== "ready"}
            />
            <PrimaryButton
              onClick={handleLaunch}
              withArrow
              disabled={launchDisabled}
              data-testid="admin-create-session"
            >
              {launching ? "מפעיל…" : "הפעלת חידון"}
            </PrimaryButton>
          </div>
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
                <SessionCard
                  session={session}
                  quizId={quizId}
                  team={team}
                  currentUserId={currentUserId}
                  onReassign={handleReassign}
                  onArchive={handleArchive}
                  onHardDelete={handleHardDelete}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function HostPicker({
  members,
  value,
  onChange,
  currentUserId,
  disabled,
  testId = "admin-host-picker",
  showLabel = true,
  emptyOptionLabel,
}: {
  members: AdminTeamMember[];
  value: string;
  onChange: (next: string) => void;
  currentUserId: string | null;
  disabled?: boolean;
  testId?: string;
  showLabel?: boolean;
  emptyOptionLabel?: string;
}) {
  const select = (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || members.length === 0}
      className="rounded-md border border-bsy-stone-200 bg-white px-2 py-1 text-[13px] text-bsy-ink focus:border-bsy-forest focus:outline-none"
      data-testid={testId}
    >
      {emptyOptionLabel !== undefined && value === "" ? (
        <option value="" disabled>
          {emptyOptionLabel}
        </option>
      ) : null}
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.email}
          {member.id === currentUserId ? " (אני)" : ""}
        </option>
      ))}
    </select>
  );

  if (!showLabel) return select;

  return (
    <label className="flex items-center gap-2 text-[12px] text-bsy-stone-700">
      <span>מנחה</span>
      {select}
    </label>
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
  team,
  currentUserId,
  onReassign,
  onArchive,
  onHardDelete,
}: {
  session: AdminSessionListRow;
  quizId: string;
  team: AdminTeamMember[];
  currentUserId: string | null;
  onReassign: (sessionId: string, hostUserId: string) => void;
  onArchive: (sessionId: string) => void;
  onHardDelete: (sessionId: string) => void;
}) {
  const created = new Date(session.createdAt);
  const canReassign = HOST_REASSIGNABLE_STATUSES.includes(session.status);
  const hostLabel = session.hostEmail ?? "ללא מנחה";
  const isMine = session.hostId !== null && session.hostId === currentUserId;
  const isArchived = session.archivedAt !== null;
  // Archive is available for ended/draft/scheduled (not live/paused).
  const canArchive =
    !isArchived &&
    (session.status === "ended" ||
      session.status === "draft" ||
      session.status === "scheduled");
  // Hard-delete only after archiving.
  const canHardDelete = isArchived;

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
          {isArchived ? (
            <span className="rounded-full bg-bsy-stone-100 px-2 py-0.5 text-[10px] text-bsy-stone-500">
              מאורכב
            </span>
          ) : null}
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
        <div className="mt-3 flex items-center gap-2 text-[12px] text-bsy-stone-700">
          <span className="text-bsy-stone-400">מנחה</span>
          {canReassign && team.length > 0 ? (
            <HostPicker
              members={team}
              value={session.hostId ?? ""}
              onChange={(next) => onReassign(session.id, next)}
              currentUserId={currentUserId}
              showLabel={false}
              testId="admin-session-host-select"
              emptyOptionLabel="ללא מנחה"
            />
          ) : (
            <span
              className="font-bold text-bsy-ink"
              data-testid="admin-session-host"
            >
              {hostLabel}
              {isMine ? " (אני)" : ""}
            </span>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
        {session.gameMode === "sync" && !isArchived ? (
          <Link
            href={`/host/${session.pin}`}
            className="font-bold text-bsy-forest hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            לוח מנחה ←
          </Link>
        ) : (
          <span
            className="text-[11px] text-bsy-stone-400"
            title="לחידון אסינכרוני אין לוח מנחה חי"
          >
            ללא לוח מנחה
          </span>
        )}
        <Link
          href={`/admin/quizzes/${quizId}/sessions/${session.id}/results`}
          className="text-bsy-stone-700 hover:text-bsy-forest"
        >
          תוצאות
        </Link>
<span className="ms-auto flex items-center gap-2">
          {canArchive ? (
            <button
              type="button"
              onClick={() => onArchive(session.id)}
              className="text-[12px] text-bsy-stone-500 hover:text-bsy-error"
              data-testid="admin-session-archive"
            >
              ארכב
            </button>
          ) : null}
          {canHardDelete ? (
            <button
              type="button"
              onClick={() => onHardDelete(session.id)}
              className="text-[12px] text-bsy-error hover:underline"
              data-testid="admin-session-hard-delete"
            >
              מחק לצמיתות
            </button>
          ) : null}
          {!isArchived ? <SharePinPopover pin={session.pin} variant="compact" /> : null}
        </span>
      </div>
    </article>
  );
}
