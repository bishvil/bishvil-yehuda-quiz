"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  getAdminSessionResults,
  isAdminApiError,
  listAdminQuestions,
  type AdminQuestionListItem,
  type AdminSessionResultPlayer,
  type AdminSessionResultsResponse,
} from "@/src/lib/admin/api-client";
import {
  aggregateAccuracy,
  describeQuestionAccuracy,
  participantStatusLabel,
  summarizeResponses,
  topScorers,
} from "@/src/lib/admin/results";
import { AdminCard } from "@/src/components/admin/cards";
import { SESSION_STATUS_LABELS } from "@/src/lib/constants";

const secondaryButton =
  "min-h-11 shrink-0 rounded-full border border-bsy-stone-200 bg-white px-4 py-2 text-[13px] font-bold text-bsy-forest transition-colors hover:bg-bsy-stone-50 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest";

interface Props {
  quizId: string;
  sessionId: string;
}

export function ResultsScreen({ quizId, sessionId }: Props) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [results, setResults] = useState<AdminSessionResultsResponse | null>(
    null,
  );
  const [questions, setQuestions] = useState<AdminQuestionListItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(true);
  const [unlockingIds, setUnlockingIds] = useState<Set<string>>(new Set());
  const unlockRequests = useRef(new Set<string>());

  async function unlockStation(player: AdminSessionResultPlayer) {
    if (
      !player.locationLockedQuestionId ||
      unlockRequests.current.has(player.id)
    )
      return;
    unlockRequests.current.add(player.id);
    setUnlockingIds(new Set(unlockRequests.current));
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/sessions/${sessionId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: player.id,
          questionId: player.locationLockedQuestionId,
        }),
      });
      if (!response.ok) throw new Error("unlock failed");
      setResults((current) =>
        current
          ? {
              ...current,
              players: current.players.map((row) =>
                row.id === player.id
                  ? { ...row, locationLockedQuestionId: null }
                  : row,
              ),
            }
          : current,
      );
    } catch {
      setErrorMessage("פתיחת התחנה נכשלה. נסו שוב או רעננו את התוצאות.");
    } finally {
      unlockRequests.current.delete(player.id);
      setUnlockingIds(new Set(unlockRequests.current));
    }
  }

  function refreshResults() {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMessage(null);
    setRefreshVersion((version) => version + 1);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [resultsBody, questionsBody] = await Promise.all([
          getAdminSessionResults(sessionId),
          listAdminQuestions(quizId),
        ]);
        if (cancelled) return;
        if (isAdminApiError(resultsBody) || isAdminApiError(questionsBody)) {
          throw new Error("read failed");
        }
        setResults(resultsBody);
        setQuestions(questionsBody.questions);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setErrorMessage("לא הצלחנו לטעון את התוצאות. נסו לרענן שוב.");
        setStatus((current) => (current === "ready" ? "ready" : "error"));
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, sessionId, refreshVersion]);

  const summary = useMemo(() => {
    if (!results) return null;
    return summarizeResponses(results.players, results.answers);
  }, [results]);

  const leaderboard = useMemo(
    () => (results ? topScorers(results.players) : []),
    [results],
  );

  const sortedPlayers = useMemo(
    () =>
      results
        ? [...results.players].sort((a, b) => {
            if (b.totalScore !== a.totalScore)
              return b.totalScore - a.totalScore;
            if (b.correctCount !== a.correctCount)
              return b.correctCount - a.correctCount;
            return a.firstName.localeCompare(b.firstName, "he");
          })
        : [],
    [results],
  );

  const accuracy = useMemo(
    () => (results ? aggregateAccuracy(results.answers) : []),
    [results],
  );

  const accuracyByQuestion = useMemo(
    () => new Map(accuracy.map((row) => [row.questionId, row])),
    [accuracy],
  );

  const orderedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.ordinal - b.ordinal),
    [questions],
  );

  return (
    <>
      <AdminTopBar
        crumbs={[
          { label: "החידונים שלי", href: "/admin/quizzes" },
          { label: "משחקים", href: `/admin/quizzes/${quizId}/sessions` },
          { label: "תוצאות" },
        ]}
      />

      <section className="flex-1 px-4 py-6 md:px-8">
        {status === "loading" ? (
          <p className="text-bsy-stone-700">טוען תוצאות…</p>
        ) : status === "error" ? (
          <div
            role="alert"
            className="rounded-xl border border-bsy-stone-100 bg-white p-4 text-bsy-error"
          >
            <p>{errorMessage ?? "שגיאה בטעינה"}</p>
            <button
              type="button"
              className={secondaryButton}
              disabled={refreshing}
              onClick={refreshResults}
            >
              {refreshing ? "טוען…" : "ניסיון נוסף"}
            </button>
          </div>
        ) : results && summary ? (
          <div className="flex flex-col gap-6">
            <header className="rounded-xl border border-bsy-stone-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bsy-stone-100 pb-3">
                <div className="flex items-center gap-2 text-[13px] text-bsy-stone-700">
                  קוד משחק{" "}
                  <span className="font-mono text-xl text-bsy-brown" dir="ltr">
                    {results.session.pin}
                  </span>
                </div>
                <span className="rounded-full bg-bsy-paper-warm px-3 py-1 text-[12px] font-bold text-bsy-forest">
                  {results.session.status === "ended"
                    ? "תוצאות סופיות"
                    : "תוצאות ביניים"}{" "}
                  · {SESSION_STATUS_LABELS[results.session.status]}
                </span>
              </div>
              {results.session.status !== "ended" ? (
                <p className="mt-2 text-[12px] text-bsy-stone-700">
                  המשחק עדיין פתוח. הניקוד והדירוג עשויים להשתנות עם קבלת תשובות
                  נוספות.
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="משתתפים" value={summary.totalPlayers} />
                <Stat label="סיימו" value={summary.finishedPlayers} />
                <Stat label="תשובות" value={summary.totalAnswers} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportSessionPlayersCsv(sortedPlayers)}
                  className="min-h-11 rounded-full bg-bsy-forest px-4 py-2 text-[13px] font-bold text-white hover:bg-bsy-forest-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bsy-forest"
                >
                  ייצוא CSV
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={refreshing}
                  aria-busy={refreshing}
                  onClick={refreshResults}
                >
                  {refreshing ? "מרענן…" : "רענון תוצאות"}
                </button>
              </div>
            </header>

            {errorMessage ? (
              <p
                role="alert"
                className="rounded-xl border border-bsy-stone-100 bg-white p-4 text-[13px] text-bsy-error"
              >
                {errorMessage}
              </p>
            ) : null}
            {results.players.some(
              (player) => player.locationLockedQuestionId,
            ) ? (
              <AdminCard interactive={false}>
                <h2 className="font-[var(--font-display)] text-xl text-bsy-brown">
                  משתתפים הממתינים לפתיחה לפי מיקום
                </h2>
                <p className="mt-2 text-[13px] text-bsy-stone-700">
                  במקרה של קושי באיתור המיקום, ניתן לפתוח את התחנה עבור המשתתף.
                </p>
                <ul className="mt-4 divide-y divide-bsy-stone-100">
                  {results.players
                    .filter((player) => player.locationLockedQuestionId)
                    .map((player) => (
                      <li
                        key={player.id}
                        className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-bsy-ink">
                            {player.firstName} {player.lastName}
                          </p>
                          <p className="mt-1 text-[12px] text-bsy-stone-700">
                            {questions.find(
                              (question) =>
                                question.id === player.locationLockedQuestionId,
                            )?.prompt ?? "ממתין לפתיחת התחנה הבאה"}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={secondaryButton}
                          disabled={unlockingIds.has(player.id)}
                          aria-busy={unlockingIds.has(player.id)}
                          onClick={() => void unlockStation(player)}
                        >
                          {unlockingIds.has(player.id)
                            ? "פותח תחנה…"
                            : "פתיחת התחנה על ידי מפעיל"}
                        </button>
                      </li>
                    ))}
                </ul>
              </AdminCard>
            ) : null}
            {results.answers.some((answer) => answer.textAnswer) ? (
              <AdminCard interactive={false}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-[var(--font-display)] text-xl text-bsy-brown">
                    תשובות פתוחות
                  </h2>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() =>
                      downloadCsv("open-answers.csv", [
                        ["משתתף", "שאלה", "תשובה", "נכונה", "ניקוד"],
                        ...results.answers
                          .filter((answer) => answer.textAnswer)
                          .map((answer) => {
                            const player = results.players.find(
                              (row) => row.id === answer.participantId,
                            );
                            return [
                              player
                                ? `${player.firstName} ${player.lastName}`
                                : "משתתף",
                              questions.find((q) => q.id === answer.questionId)
                                ?.prompt ?? "שאלה",
                              answer.textAnswer ?? "",
                              answer.isCorrect ? "כן" : "לא",
                              String(answer.score),
                            ];
                          }),
                      ])
                    }
                  >
                    ייצוא תשובות פתוחות
                  </button>
                </div>
                <ul className="mt-4 space-y-3">
                  {results.answers
                    .filter((answer) => answer.textAnswer)
                    .map((answer) => {
                      const player = results.players.find(
                        (row) => row.id === answer.participantId,
                      );
                      return (
                        <li
                          key={`${answer.participantId}-${answer.questionId}`}
                          className="rounded-lg border border-bsy-stone-100 bg-bsy-stone-50 p-3 text-[13px]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-bsy-ink">
                              {player
                                ? `${player.firstName} ${player.lastName}`
                                : "משתתף"}
                            </span>
                            <span
                              className={
                                answer.isCorrect
                                  ? "text-bsy-forest"
                                  : "text-bsy-error"
                              }
                            >
                              {answer.isCorrect ? "נכונה" : "שגויה"} ·{" "}
                              {answer.score} נקודות
                            </span>
                          </div>
                          <p className="mt-2 text-bsy-stone-700">
                            {questions.find((q) => q.id === answer.questionId)
                              ?.prompt ?? "שאלה"}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-bsy-ink">
                            {answer.textAnswer}
                          </p>
                        </li>
                      );
                    })}
                </ul>
              </AdminCard>
            ) : null}

            <section>
              <h2 className="mb-3 font-[var(--font-display)] text-xl text-bsy-brown">
                מובילים
              </h2>
              {leaderboard.length === 0 ? (
                <p className="text-[13px] text-bsy-stone-700">
                  עדיין אין משתתפים שצברו ניקוד.
                </p>
              ) : (
                <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {leaderboard.map((player, idx) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-3 rounded-md border border-bsy-stone-100 bg-white px-3 py-2"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bsy-paper-warm text-[13px] font-bold text-bsy-forest">
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-[14px]">
                        {player.firstName} {player.lastName}
                      </span>
                      <span
                        className="font-mono text-[14px] text-bsy-brown"
                        dir="ltr"
                      >
                        {player.totalScore.toLocaleString("he-IL")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-[var(--font-display)] text-xl text-bsy-brown">
                משתתפים
              </h2>
              {sortedPlayers.length === 0 ? (
                <p className="text-[13px] text-bsy-stone-700">
                  אין משתתפים במשחק.
                </p>
              ) : (
                <>
                  <ul className="grid gap-3 md:hidden">
                    {sortedPlayers.map((player) => (
                      <li
                        key={`${player.id}:mobile`}
                        className="rounded-md border border-bsy-stone-100 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-bold text-bsy-ink">
                              {player.firstName} {player.lastName}
                            </div>
                            <div
                              className="mt-0.5 truncate text-[12px] text-bsy-stone-700"
                              dir="ltr"
                            >
                              {player.phone}
                            </div>
                          </div>
                          <div className="shrink-0 text-left">
                            <div
                              className="font-[var(--font-display)] text-[22px] leading-none text-bsy-brown"
                              dir="ltr"
                            >
                              {player.totalScore.toLocaleString("he-IL")}
                            </div>
                            <div className="mt-1 text-[11px] text-bsy-stone-400">
                              ניקוד
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                          <MobileField
                            label="יחידה"
                            value={player.profileFields.unit ?? player.unit}
                          />
                          <MobileField
                            label="צוות"
                            value={player.profileFields.team ?? player.team}
                          />
                          <MobileField
                            label="סטטוס"
                            value={participantStatusLabel(player.status)}
                          />
                          <MobileField
                            label="נכונות"
                            value={String(player.correctCount)}
                            ltr
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto rounded-md border border-bsy-stone-100 bg-white md:block">
                    <table className="min-w-full border-collapse text-right text-[13px]">
                      <thead className="bg-bsy-stone-50 text-[11px] uppercase tracking-[0.14em] text-bsy-stone-700">
                        <tr>
                          <th className="px-3 py-2">שם</th>
                          <th className="px-3 py-2">טלפון</th>
                          <th className="px-3 py-2">יחידה</th>
                          <th className="px-3 py-2">צוות</th>
                          <th className="px-3 py-2">סטטוס</th>
                          <th className="px-3 py-2">ניקוד</th>
                          <th className="px-3 py-2">נכונות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPlayers.map((player) => (
                          <tr
                            key={player.id}
                            className="border-t border-bsy-stone-100"
                          >
                            <td className="px-3 py-2 font-bold text-bsy-ink">
                              {player.firstName} {player.lastName}
                            </td>
                            <td className="px-3 py-2" dir="ltr">
                              {player.phone}
                            </td>
                            <td className="px-3 py-2">
                              {player.profileFields.unit ?? player.unit ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              {player.profileFields.team ?? player.team ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              {participantStatusLabel(player.status)}
                            </td>
                            <td className="px-3 py-2 font-mono" dir="ltr">
                              {player.totalScore.toLocaleString("he-IL")}
                            </td>
                            <td className="px-3 py-2 font-mono" dir="ltr">
                              {player.correctCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            <section>
              <h2 className="mb-3 font-[var(--font-display)] text-xl text-bsy-brown">
                דיוק לפי תחנה
              </h2>
              {questions.length === 0 ? (
                <p className="text-[13px] text-bsy-stone-700">אין תחנות.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {orderedQuestions.map((question) => {
                    const row = accuracyByQuestion.get(question.id);
                    const { accuracyPct: pct, label } =
                      describeQuestionAccuracy(question.type, row);
                    return (
                      <li
                        key={question.id}
                        className="rounded-md border border-bsy-stone-100 bg-white px-4 py-3"
                      >
                        <div className="flex flex-col gap-2 text-[13px] sm:flex-row sm:items-center sm:justify-between">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-bsy-stone-400">
                              {String(question.ordinal).padStart(2, "0")}
                            </span>
                            <span className="line-clamp-1 text-bsy-ink">
                              {question.prompt}
                            </span>
                          </span>
                          <span className="shrink-0 text-bsy-brown">
                            {label}
                          </span>
                        </div>
                        {pct !== null ? (
                          <div
                            role="progressbar"
                            aria-label={`דיוק: ${question.prompt}`}
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="mt-2 h-2 overflow-hidden rounded-full bg-bsy-stone-50"
                          >
                            <div
                              className="h-full bg-bsy-lime"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
        {label}
      </div>
      <div
        className="text-right font-[var(--font-display)] text-2xl text-bsy-brown"
        dir={typeof value === "number" ? "ltr" : "rtl"}
      >
        {value}
      </div>
    </div>
  );
}

function MobileField({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string | null | undefined;
  ltr?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md bg-bsy-stone-50 px-2.5 py-2">
      <div className="text-[10.5px] font-bold text-bsy-stone-400">{label}</div>
      <div
        className="mt-0.5 truncate text-[12.5px] text-bsy-stone-700"
        dir={ltr ? "ltr" : "rtl"}
      >
        {value && value.length > 0 ? value : "—"}
      </div>
    </div>
  );
}

function exportSessionPlayersCsv(players: AdminSessionResultPlayer[]) {
  const profileKeys = Array.from(
    new Set(players.flatMap((player) => Object.keys(player.profileFields))),
  ).filter((key) => !["firstName", "lastName", "phone"].includes(key));

  const headers = [
    "שם פרטי",
    "שם משפחה",
    "טלפון",
    "ספק זיהוי",
    "מזהה",
    "סטטוס",
    "ניקוד",
    "תשובות נכונות",
    "רצף",
    "תאריך הצטרפות",
    ...profileKeys.map(profileLabel),
  ];

  const rows = players.map((player) => [
    player.firstName,
    player.lastName,
    player.phone,
    player.identityProvider,
    player.identityKey ?? "",
    participantStatusLabel(player.status),
    String(player.totalScore),
    String(player.correctCount),
    String(player.streak),
    player.joinedAt,
    ...profileKeys.map((key) => player.profileFields[key] ?? ""),
  ]);

  downloadCsv("session-participants.csv", [headers, ...rows]);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/\r?\n/g, " ");
  return /[",\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
}

function profileLabel(key: string) {
  const labels: Record<string, string> = {
    unit: "יחידה",
    team: "צוות",
  };
  return labels[key] ?? key;
}
