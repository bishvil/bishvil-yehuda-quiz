"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { HostStatusPill } from "@/src/components/host/HostStatusPill";
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

      <section className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">
            שגיאה בטעינת המשחקים: {error}
          </p>
        ) : sessions.length === 0 ? (
          <div className="rounded-md border border-bsy-stone-100 bg-white p-6 text-center">
            <p className="m-0 text-[14px] text-bsy-stone-700">
              אין משחקים פעילים כרגע.
            </p>
            <p className="mt-2 text-[12px] text-bsy-stone-400">
              צור משחק חדש מתוך אחד החידונים שלך.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
  return (
    <article className="flex h-full flex-col justify-between rounded-md border border-bsy-stone-100 bg-white p-4 shadow-[var(--shadow-xs)]">
      <div>
        <div className="flex items-center justify-between gap-2">
          <HostStatusPill status={session.status} />
          <span className="text-[11px] text-bsy-stone-400">
            {created.toLocaleString("he-IL", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <h3 className="mt-3 m-0 text-[15px] font-bold text-bsy-brown">
          {session.quizTitle}
        </h3>

        <p className="mt-3 mb-0 flex items-baseline gap-2">
          <span className="text-[11px] text-bsy-stone-400">קוד הצטרפות</span>
          <span
            className="font-[var(--font-display)] text-3xl text-bsy-brown"
            dir="ltr"
          >
            {session.pin}
          </span>
        </p>

        <p className="mt-2 mb-0 flex items-baseline gap-2 text-[12px] text-bsy-stone-700">
          <span className="text-bsy-stone-400">מנחה</span>
          <span className="font-bold text-bsy-ink">
            {session.hostEmail ?? "ללא מנחה"}
          </span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {session.gameMode === "sync" ? (
          <Link
            href={`/host/${session.pin}`}
            className="inline-flex items-center rounded-full bg-bsy-forest px-4 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90"
          >
            פתח לוח בקרה
          </Link>
        ) : (
          <span
            className="inline-flex items-center rounded-full bg-bsy-stone-50 px-4 py-2 text-[13px] font-bold text-bsy-stone-400"
            title="לחידון אסינכרוני אין לוח מנחה חי"
          >
            ללא לוח מנחה
          </span>
        )}
        <SharePinPopover pin={session.pin} variant="compact" />
      </div>
    </article>
  );
}
