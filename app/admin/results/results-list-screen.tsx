"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";

import type { ResultsListRow } from "@/app/api/admin/results/route";

export function ResultsListScreen() {
  const [sessions, setSessions] = useState<ResultsListRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/results", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { sessions: ResultsListRow[] };
        if (cancelled) return;
        setSessions(body.sessions);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar crumbs={[{ label: "תוצאות וניתוח" }]} />

      <section className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">
            שגיאה בטעינת התוצאות: {error}
          </p>
        ) : sessions.length === 0 ? (
          <div className="rounded-md border border-bsy-stone-100 bg-white p-6 text-center">
            <p className="m-0 text-[14px] text-bsy-stone-700">
              עדיין אין משחקים שהסתיימו.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <ResultsRow row={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ResultsRow({ row }: { row: ResultsListRow }) {
  const ended = row.endedAt ? new Date(row.endedAt) : null;
  return (
    <article className="rounded-md border border-bsy-stone-100 bg-white p-4 shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-[15px] font-bold text-bsy-brown">
          {row.quizTitle}
        </h3>
        <span className="text-[11px] text-bsy-stone-400">
          {ended
            ? ended.toLocaleString("he-IL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="קוד" value={row.pin} mono />
        <Stat label="משתתפים" value={String(row.participantCount)} />
        <Stat label="ניקוד ממוצע" value={String(row.averageScore)} />
        <Stat label="מקום ראשון" value={row.topThree[0]?.name || "—"} />
      </div>

      {row.topThree.length > 0 ? (
        <ol className="mt-4 grid grid-cols-1 gap-1 md:grid-cols-3">
          {row.topThree.map((p, i) => (
            <li
              key={p.participantId}
              className="flex items-center gap-2 rounded-md bg-bsy-stone-50 px-3 py-2 text-[13px]"
            >
              <span className="font-bold text-bsy-brown">{i + 1}.</span>
              <span className="grow truncate">{p.name}</span>
              <span className="font-[var(--font-display)] text-bsy-brown" dir="ltr">
                {p.score}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-4">
        <Link
          href={`/admin/quizzes/${row.quizId}/sessions/${row.id}/results`}
          className="text-[12px] font-bold text-bsy-forest hover:underline"
        >
          תוצאות מלאות ←
        </Link>
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-bsy-stone-400">
        {label}
      </div>
      <div
        className={
          mono
            ? "font-[var(--font-display)] text-xl text-bsy-brown"
            : "text-[15px] font-bold text-bsy-brown"
        }
        dir={mono ? "ltr" : "rtl"}
      >
        {value}
      </div>
    </div>
  );
}
