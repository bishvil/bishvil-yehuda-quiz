"use client";

import { useEffect, useMemo, useState } from "react";

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
  summarizeResponses,
  topScorers,
} from "@/src/lib/admin/results";
import { SESSION_STATUS_LABELS } from "@/src/lib/constants";

interface Props {
  quizId: string;
  sessionId: string;
}

export function ResultsScreen({ quizId, sessionId }: Props) {
  const [results, setResults] = useState<AdminSessionResultsResponse | null>(
    null,
  );
  const [questions, setQuestions] = useState<AdminQuestionListItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [resultsBody, questionsBody] = await Promise.all([
        getAdminSessionResults(sessionId),
        listAdminQuestions(quizId),
      ]);
      if (cancelled) return;
      if (isAdminApiError(resultsBody)) {
        setStatus("error");
        setErrorMessage(resultsBody.message);
        return;
      }
      if (isAdminApiError(questionsBody)) {
        setStatus("error");
        setErrorMessage(questionsBody.message);
        return;
      }
      setResults(resultsBody);
      setQuestions(questionsBody.questions);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, sessionId]);

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
          <p className="text-bsy-error">{errorMessage ?? "שגיאה בטעינה"}</p>
        ) : results && summary ? (
          <div className="flex flex-col gap-6">
            <header className="grid gap-3 rounded-md border border-bsy-stone-100 bg-white px-4 py-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center lg:gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
                  PIN
                </div>
                <div className="font-mono text-2xl text-bsy-brown" dir="ltr">
                  {results.session.pin}
                </div>
              </div>
              <Stat label="משתתפים" value={summary.totalPlayers} />
              <Stat label="סיימו" value={summary.finishedPlayers} />
              <Stat label="סה״כ תשובות" value={summary.totalAnswers} />
              <Stat
                label="סטטוס"
                value={SESSION_STATUS_LABELS[results.session.status]}
              />
              <button
                type="button"
                onClick={() => exportSessionPlayersCsv(sortedPlayers)}
                className="rounded-md bg-bsy-forest px-3 py-2 text-[13px] font-bold text-white sm:col-span-2 lg:ms-auto"
              >
                ייצוא CSV
              </button>
            </header>

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
                          <MobileField label="סטטוס" value={player.status} />
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
                            <td className="px-3 py-2">{player.status}</td>
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
                    const pct = row?.accuracyPct ?? 0;
                    const total = row?.total ?? 0;
                    return (
                      <li
                        key={question.id}
                        className="rounded-md border border-bsy-stone-100 bg-white px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-bsy-stone-400">
                              {String(question.ordinal).padStart(2, "0")}
                            </span>
                            <span className="line-clamp-1 text-bsy-ink">
                              {question.prompt}
                            </span>
                          </span>
                          <span className="font-mono text-bsy-brown">
                            {pct}% · {total}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bsy-stone-50">
                          <div
                            className="h-full bg-bsy-lime"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
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
        className="font-[var(--font-display)] text-2xl text-bsy-brown"
        dir="ltr"
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
    player.status,
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
