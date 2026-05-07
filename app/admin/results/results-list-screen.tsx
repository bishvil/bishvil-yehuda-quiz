"use client";

import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  AdminCard,
  CardActions,
  CardEyebrow,
  CardTitle,
  PrimaryAction,
} from "@/src/components/admin/cards";

import type { ResultsListRow } from "@/app/api/admin/results/route";

type Top = ResultsListRow["topThree"][number];

const RANK_TONE: Array<{ dot: string; ring: string; label: string }> = [
  {
    dot: "bg-bsy-lime",
    ring: "ring-bsy-lime/40",
    label: "text-bsy-forest-deep",
  },
  {
    dot: "bg-bsy-stone-400",
    ring: "ring-bsy-stone-200",
    label: "text-bsy-stone-700",
  },
  {
    dot: "bg-bsy-stone-200",
    ring: "ring-bsy-stone-100",
    label: "text-bsy-stone-700",
  },
];

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

      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">
            שגיאה בטעינת התוצאות: {error}
          </p>
        ) : sessions.length === 0 ? (
          <div className="rounded-[12px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] p-8 text-center">
            <p className="m-0 text-[14px] text-bsy-stone-700">
              עדיין אין משחקים שהסתיימו.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <ResultsCard row={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ResultsCard({ row }: { row: ResultsListRow }) {
  const ended = row.endedAt ? new Date(row.endedAt) : null;
  const dateText = ended
    ? ended.toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const finishers = row.topThree;
  const winner = finishers[0] ?? null;
  const runnersUp = finishers.slice(1);
  const hasFinishers = finishers.length > 0;

  return (
    <AdminCard>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <CardEyebrow tone="forest">תוצאות משחק</CardEyebrow>
          {dateText ? (
            <span
              className="shrink-0 text-[11px] text-bsy-stone-400"
              dir="ltr"
            >
              {dateText}
            </span>
          ) : null}
        </div>
        <CardTitle size="md" clamp={2}>
          {row.quizTitle}
        </CardTitle>
        <p className="m-0 mt-0.5 text-[12px] text-bsy-stone-400">
          <span>קוד </span>
          <span className="font-bold text-bsy-stone-700" dir="ltr">
            {row.pin}
          </span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="משתתפים" value={row.participantCount} />
        <Metric label="ניקוד ממוצע" value={row.averageScore} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <CardEyebrow tone="forest">דירוג</CardEyebrow>
        {!hasFinishers ? (
          <p className="m-0 text-[13px] text-bsy-stone-700">
            אין משתתפים שסיימו את המשחק.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {winner ? (
              <LeaderRow rank={1} entry={winner} prominent />
            ) : null}
            {runnersUp.map((entry, i) => (
              <LeaderRow key={entry.participantId} rank={i + 2} entry={entry} />
            ))}
          </ol>
        )}
      </div>

      <div className="mt-auto">
        <CardActions
          primary={
            <PrimaryAction
              href={`/admin/quizzes/${row.quizId}/sessions/${row.id}/results`}
            >
              תוצאות מלאות
            </PrimaryAction>
          }
        />
      </div>
    </AdminCard>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-bsy-stone-50 px-3 py-2.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-bsy-stone-700">
        {label}
      </span>
      <span
        className="font-[var(--font-display)] text-[24px] leading-none text-bsy-brown"
        dir="ltr"
      >
        {value}
      </span>
    </div>
  );
}

function LeaderRow({
  rank,
  entry,
  prominent = false,
}: {
  rank: number;
  entry: Top;
  prominent?: boolean;
}) {
  const tone = RANK_TONE[rank - 1] ?? RANK_TONE[2]!;
  const containerCls = prominent
    ? "flex items-center gap-3 rounded-md bg-bsy-lime/10 px-3 py-2.5 ring-1 ring-bsy-lime/30"
    : "flex items-center gap-3 px-3 py-1.5";
  const nameCls = prominent
    ? "min-w-0 flex-1 truncate text-[14px] font-bold text-bsy-ink"
    : "min-w-0 flex-1 truncate text-[13px] text-bsy-stone-700";
  const scoreCls = prominent
    ? "shrink-0 font-[var(--font-display)] text-[22px] leading-none text-bsy-brown"
    : "shrink-0 font-[var(--font-display)] text-[16px] leading-none text-bsy-stone-700";
  return (
    <li className={containerCls}>
      <span
        className={[
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset",
          tone.label,
          tone.ring,
          prominent ? "bg-bsy-paper" : "bg-bsy-stone-50",
        ].join(" ")}
        aria-hidden="true"
      >
        <span
          className={["block h-1.5 w-1.5 rounded-full", tone.dot].join(" ")}
        />
      </span>
      <span className="sr-only">מקום {rank}</span>
      <span className={nameCls}>{entry.name}</span>
      <span className={scoreCls} dir="ltr">
        {entry.score}
      </span>
    </li>
  );
}
