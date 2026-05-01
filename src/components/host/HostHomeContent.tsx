"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { HostHomeCard } from "@/src/components/host/HostHomeCard";
import type { HostSessionRow } from "@/src/lib/sessions/host-sessions";
import { groupHostSessions } from "@/src/lib/sessions/host-sessions";

interface HostHomeContentProps {
  email: string;
  sessions: HostSessionRow[];
  /** True iff the signed-in principal is also `app_metadata.role === "admin"`.
   * Drives whether the empty state links to `/admin/quizzes`. */
  isAdmin: boolean;
  /** Becomes a real action once `/api/auth/signout` ships (BLOCKED today). */
  signOutHref: string | null;
}

/**
 * Presentational shell for `/host`. Visual language pulled from
 * `_prototype/untitled/project/host-mobile.jsx` — the brand chrome at the
 * top, large LTR PIN inside the card, pill-shaped primary action — but the
 * page composition (a session list grouped by lifecycle status) is unique
 * to the home view since the prototype renders only the live host surface.
 */
export function HostHomeContent({
  email,
  sessions,
  isAdmin,
  signOutHref,
}: HostHomeContentProps) {
  const { active, ended } = groupHostSessions(sessions);
  const hasAny = sessions.length > 0;

  return (
    <main
      className="min-h-screen bg-bsy-paper"
      dir="rtl"
      data-testid="host-home"
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-bsy-stone-100 bg-bsy-paper-warm px-5 py-3"
      >
        <div className="flex items-center gap-3">
          <Image
            src="/logos/logo_yehuda.png"
            alt="בשביל יהודה"
            width={96}
            height={44}
            className="h-9 w-auto object-contain"
            priority
          />
          <span className="hidden font-[var(--font-display)] text-[15px] text-bsy-brown sm:inline">
            בשביל יהודה — חידון
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-bsy-stone-700 sm:inline">
            <bdi dir="ltr" data-testid="host-home-email">
              {email}
            </bdi>
          </span>
          <SignOutButton href={signOutHref} />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <h1 className="m-0 mb-6 font-[var(--font-display)] text-2xl text-bsy-brown">
          החידונים שלי
        </h1>

        {!hasAny ? (
          <EmptyState isAdmin={isAdmin} />
        ) : (
          <>
            {active.length > 0 ? (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="host-home-active">
                {active.map((session) => (
                  <li key={session.id}>
                    <HostHomeCard session={session} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-bsy-stone-700">
                אין כרגע חידונים פעילים. רענו את הדף כשיוקצה לכם חידון חדש.
              </p>
            )}

            {ended.length > 0 ? (
              <EndedSection rows={ended} />
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

function EndedSection({ rows }: { rows: HostSessionRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-8 rounded-md border border-bsy-stone-100 bg-white px-4 py-2"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      data-testid="host-home-ended"
    >
      <summary className="cursor-pointer list-none py-2 text-[13px] font-bold text-bsy-stone-700">
        סשנים שהסתיימו ({rows.length})
      </summary>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((session) => (
          <li key={session.id}>
            <HostHomeCard session={session} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-md border border-dashed border-bsy-stone-200 bg-white px-6 py-16 text-center"
      data-testid="host-home-empty"
    >
      <h2 className="m-0 font-[var(--font-display)] text-2xl text-bsy-brown">
        אין כרגע חידונים שמוקצים אליכם
      </h2>
      <p className="m-0 max-w-md text-[13px] text-bsy-stone-700">
        ברגע שמנהל יקצה לכם חידון, הוא יופיע כאן עם קוד הצטרפות וכפתור כניסה לדשבורד.
      </p>
      {isAdmin ? (
        <Link
          href="/admin/quizzes"
          className="inline-flex items-center rounded-full bg-bsy-green-forest px-4 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90"
        >
          ניהול חידונים ←
        </Link>
      ) : null}
    </div>
  );
}

function SignOutButton({ href }: { href: string | null }) {
  // Until `/api/auth/signout` ships, render a disabled pill so the affordance
  // is visible without being a dangling link. Tracked as a followup task.
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex cursor-not-allowed items-center rounded-full bg-bsy-stone-50 px-3 py-1.5 text-[12px] font-bold text-bsy-stone-400"
        title="ניתוק יזמין בעדכון הבא"
        data-testid="host-home-signout"
      >
        התנתק
      </span>
    );
  }
  return (
    <form action={href} method="post">
      <button
        type="submit"
        className="inline-flex items-center rounded-full border border-bsy-stone-200 bg-white px-3 py-1.5 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50"
        data-testid="host-home-signout"
      >
        התנתק
      </button>
    </form>
  );
}
