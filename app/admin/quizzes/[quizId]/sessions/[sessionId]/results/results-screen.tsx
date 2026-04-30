"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  getAdminSessionResults,
  isAdminApiError,
  listAdminQuestions,
  type AdminQuestionListItem,
  type AdminSessionResultsResponse,
} from "@/src/lib/admin/api-client";
import {
  aggregateAccuracy,
  summarizeResponses,
  topScorers,
} from "@/src/lib/admin/results";

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
    () => (results ? topScorers(results.players, 6) : []),
    [results],
  );

  const accuracy = useMemo(
    () => (results ? aggregateAccuracy(results.answers) : []),
    [results],
  );

  const accuracyByQuestion = new Map(
    accuracy.map((row) => [row.questionId, row]),
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
            <header className="flex flex-wrap items-center gap-4 rounded-md border border-bsy-stone-100 bg-white px-4 py-3">
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
                value={
                  results.session.status === "ended"
                    ? "הסתיים"
                    : results.session.status === "live"
                      ? "פעיל"
                      : results.session.status === "paused"
                        ? "בהשהיה"
                        : "מתוזמן"
                }
              />
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
                דיוק לפי תחנה
              </h2>
              {questions.length === 0 ? (
                <p className="text-[13px] text-bsy-stone-700">אין תחנות.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {questions
                    .slice()
                    .sort((a, b) => a.ordinal - b.ordinal)
                    .map((question) => {
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
    <div>
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
