"use client";

import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import {
  AdminCard,
  BrandSwatch,
  CardActions,
  CardEyebrow,
  CardTitle,
  PrimaryAction,
  StatBlock,
  StatusChip,
  type ChipStatus,
} from "@/src/components/admin/cards";
import { SharePinPopover } from "@/src/components/share/SharePinPopover";

import type { ActiveSessionRow } from "@/app/api/admin/sessions/active/route";

const REFRESH_MS = 10_000;

export function ActiveSessionsScreen() {
  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await fetch("/api/admin/sessions/active", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { sessions: ActiveSessionRow[] };
        if (cancelled) return;
        setSessions(body.sessions);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStatus("error");
      }
    }

    void load();
    timer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar crumbs={[{ label: "משחקים פעילים" }]} />

      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">
            שגיאה בטעינת המשחקים: {error}
          </p>
        ) : sessions.length === 0 ? (
          <div className="rounded-[12px] border border-bsy-stone-100 bg-[color:var(--bsy-paper-card)] p-8 text-center">
            <p className="m-0 text-[14px] text-bsy-stone-700">
              אין משחקים פעילים כרגע.
            </p>
            <p className="mt-2 text-[12px] text-bsy-stone-400">
              צור משחק חדש מתוך אחד החידונים שלך.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <ActiveSessionCard session={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function ActiveSessionCard({ session }: { session: ActiveSessionRow }) {
  const created = new Date(session.startedAt ?? session.createdAt);
  const tone = session.status === "live" ? "live" : "default";
  const chipStatus = session.status as ChipStatus;
  const isAsync = session.gameMode === "async";

  return (
    <AdminCard tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <StatusChip status={chipStatus} />
        <span className="text-[11px] text-bsy-stone-400" dir="ltr">
          {created.toLocaleString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <BrandSwatch name={session.quizTitle} size="sm" />
        <div className="min-w-0 flex-1">
          <CardEyebrow>{isAsync ? "אסינכרוני" : "סינכרוני"}</CardEyebrow>
          <CardTitle size="md" clamp={1}>
            {session.quizTitle}
          </CardTitle>
        </div>
      </div>

      <div className="mt-5">
        <StatBlock
          label="קוד הצטרפות"
          size="xl"
          display
          ltr
          value={session.pin}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
        <span className="text-bsy-stone-400">מנחה</span>
        <span className="font-bold text-bsy-ink" dir="ltr">
          {session.hostEmail ?? "—"}
        </span>
      </div>

      <div className="mt-auto">
        <CardActions
          primary={
            <div className="flex flex-wrap items-center gap-2">
              {isAsync ? (
                <span className="text-[12.5px] text-bsy-stone-700">
                  משחק עצמאי — אין לוח מנחה
                </span>
              ) : (
                <PrimaryAction href={`/host/${session.pin}`} arrow={false}>
                  פתח לוח בקרה
                </PrimaryAction>
              )}
              <SharePinPopover pin={session.pin} variant="compact" />
            </div>
          }
        />
      </div>
    </AdminCard>
  );
}
