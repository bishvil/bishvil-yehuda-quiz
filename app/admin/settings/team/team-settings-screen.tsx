"use client";

import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";
import { MIN_PASSWORD_LENGTH } from "@/src/lib/auth/validation";

import type { TeamMemberRow } from "@/app/api/admin/team/route";

const ROLE_LABELS: Record<TeamMemberRow["role"], string> = {
  admin: "מנהל",
  host: "מארח",
};

type TopState =
  | { kind: "idle" }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

export function TeamSettingsScreen() {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"host" | "admin">("host");
  const [createState, setCreateState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [createError, setCreateError] = useState<string | null>(null);

  const [topState, setTopState] = useState<TopState>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/team", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          members: TeamMemberRow[];
          currentUserId: string;
        };
        if (cancelled) return;
        setMembers(body.members);
        setCurrentUserId(body.currentUserId);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  function flashInfo(message: string) {
    setTopState({ kind: "info", message });
    window.setTimeout(() => setTopState({ kind: "idle" }), 3000);
  }

  function flashError(message: string) {
    setTopState({ kind: "error", message });
  }

  async function toggleRole(member: TeamMemberRow) {
    const next = member.role === "admin" ? "host" : "admin";
    setBusyId(member.id);
    try {
      const res = await fetch("/api/admin/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id, role: next }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { member: TeamMemberRow };
      setMembers((prev) =>
        prev.map((m) => (m.id === body.member.id ? body.member : m)),
      );
    } catch (err) {
      flashError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!createEmail.trim() || !createPassword) return;
    setCreateState("saving");
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          role: createRole,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      const responseBody = (await res.json()) as { member: TeamMemberRow };
      setMembers((prev) =>
        [...prev, responseBody.member].sort((a, b) =>
          a.email.localeCompare(b.email),
        ),
      );
      setCreateState("idle");
      setCreateEmail("");
      setCreatePassword("");
      flashInfo("המשתמש נוצר.");
    } catch (err) {
      setCreateError((err as Error).message);
      setCreateState("error");
    }
  }

  async function sendInvite(email: string) {
    if (!email.trim()) return;
    try {
      const res = await fetch("/api/admin/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: createRole }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      flashInfo("הזמנה נשלחה.");
      setCreateEmail("");
      setReloadTick((t) => t + 1);
    } catch (err) {
      flashError((err as Error).message);
    }
  }

  async function sendReset(member: TeamMemberRow) {
    setBusyId(member.id);
    try {
      const res = await fetch("/api/admin/team/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      const okBody = (await res.json().catch(() => null)) as
        | { actionLink?: string }
        | null;
      if (okBody?.actionLink) {
        try {
          await navigator.clipboard.writeText(okBody.actionLink);
          flashInfo(
            "סביבת פיתוח: הקישור הועתק ללוח. ייתכן שלא נשלח מייל בפועל.",
          );
        } catch {
          window.prompt("העתק את קישור האיפוס:", okBody.actionLink);
          flashInfo("סביבת פיתוח: הקישור מוצג להעתקה ידנית.");
        }
      } else {
        flashInfo(`נשלח קישור איפוס ל־${member.email || member.id}.`);
      }
    } catch (err) {
      flashError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function cleanupOwnership(member: TeamMemberRow) {
    const confirmed = window.confirm(
      `להעביר את ${member.ownedQuizzes} החידונים ול־${member.ownedSessions} המשחקים אל המשתמש הנוכחי?\n` +
        "הבעלות על חידונים תועבר אליך, ומשחקים יישחררו מהמארח (host_id=null).",
    );
    if (!confirmed) return;
    setBusyId(member.id);
    try {
      const res = await fetch("/api/admin/team/cleanup-ownership", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      flashInfo("בעלות הועברה. כעת ניתן למחוק את המשתמש.");
      setReloadTick((t) => t + 1);
    } catch (err) {
      flashError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMember(member: TeamMemberRow) {
    const confirmed = window.confirm(
      `למחוק את ${member.email || member.id}? פעולה זו אינה הפיכה.`,
    );
    if (!confirmed) return;
    setBusyId(member.id);
    try {
      const res = await fetch("/api/admin/team", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      flashInfo("המשתמש נמחק.");
    } catch (err) {
      flashError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar crumbs={[{ label: "הגדרות" }, { label: "צוות" }]} />

      <section className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <div className="mb-4 rounded-md border border-bsy-stone-100 bg-white p-4 text-[13px] leading-6 text-bsy-stone-700">
          <p className="mb-1 font-bold text-bsy-brown">תפקידים</p>
          <p>
            <span className="font-bold">מנהל</span> — ניהול משתמשים, יצירה
            ועריכה של חידונים, צפייה בכל המשחקים, וניהול הגדרות. יכול לפעול גם
            כמארח.
          </p>
          <p>
            <span className="font-bold">מארח</span> — מריץ משחקים שהוקצו לו
            מתוך חידונים קיימים. אינו יוצר חידונים, אינו מנהל צוות, ואינו
            רואה את התכנים של משתמשים אחרים.
          </p>
        </div>

        <form
          onSubmit={submitCreate}
          className="mb-6 flex flex-col gap-3 rounded-md border border-bsy-stone-100 bg-white p-4"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex grow flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
                אימייל
              </span>
              <input
                type="email"
                required
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-brown"
              />
            </label>
            <label className="flex grow flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
                {`סיסמה ראשונית (${MIN_PASSWORD_LENGTH}+ תווים)`}
              </span>
              <input
                type="text"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="ניתן לשתף עם המשתמש"
                dir="ltr"
                className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-brown"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
                תפקיד
              </span>
              <select
                value={createRole}
                onChange={(e) =>
                  setCreateRole(e.target.value as "host" | "admin")
                }
                className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-brown"
              >
                <option value="host">מארח</option>
                <option value="admin">מנהל</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={createState === "saving"}
              className="rounded-full bg-bsy-forest px-5 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90 disabled:opacity-50"
            >
              {createState === "saving" ? "יוצר…" : "צור משתמש"}
            </button>
            <button
              type="button"
              onClick={() => sendInvite(createEmail)}
              disabled={!createEmail.trim()}
              className="rounded-full border border-bsy-stone-200 px-4 py-2 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50 disabled:opacity-50"
              title="שולח קישור הזמנה למייל; המשתמש קובע סיסמה בעצמו"
            >
              שלח קישור הזמנה במקום
            </button>
            {createState === "error" && createError ? (
              <span className="text-[12px] text-red-700">{createError}</span>
            ) : null}
          </div>
        </form>

        {topState.kind !== "idle" ? (
          <div
            className={`mb-4 rounded-md border px-3 py-2 text-[13px] ${
              topState.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-bsy-stone-100 bg-white text-bsy-stone-700"
            }`}
            role={topState.kind === "error" ? "alert" : "status"}
          >
            {topState.message}
          </div>
        ) : null}

        {status === "loading" ? (
          <p className="text-[13px] text-bsy-stone-700">טוען…</p>
        ) : status === "error" ? (
          <p className="text-[13px] text-red-700">לא ניתן לטעון את הצוות.</p>
        ) : members.length === 0 ? (
          <div className="rounded-md border border-bsy-stone-100 bg-white p-6 text-center text-[14px] text-bsy-stone-700">
            עוד אין חברי צוות.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-md border border-bsy-stone-100 bg-white">
            {members.map((m) => {
              const isMe = m.id === currentUserId;
              const ownsContent = m.ownedQuizzes > 0 || m.ownedSessions > 0;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 border-b border-bsy-stone-100 px-4 py-3 last:border-b-0"
                >
                  <span className="grow text-[14px] text-bsy-brown" dir="ltr">
                    {m.email || m.id}
                    {isMe ? (
                      <span className="ms-2 text-[11px] text-bsy-stone-400">
                        (אני)
                      </span>
                    ) : null}
                  </span>
                  <span className="rounded-full bg-bsy-stone-50 px-3 py-1 text-[11px] font-bold text-bsy-stone-700">
                    {ROLE_LABELS[m.role]}
                  </span>
                  <span
                    className="rounded-full bg-bsy-stone-50 px-3 py-1 text-[11px] text-bsy-stone-700"
                    title="חידונים בבעלות / משחקים שמארח"
                  >
                    {m.ownedQuizzes} חידונים · {m.ownedSessions} משחקים
                  </span>
                  <span className="text-[11px] text-bsy-stone-400">
                    {m.lastSignInAt
                      ? new Date(m.lastSignInAt).toLocaleDateString("he-IL")
                      : "טרם התחבר"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRole(m)}
                    disabled={busyId === m.id}
                    className="rounded-full border border-bsy-stone-200 px-3 py-1 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50 disabled:opacity-50"
                  >
                    {m.role === "admin" ? "הפוך למארח" : "הפוך למנהל"}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendReset(m)}
                    disabled={busyId === m.id || !m.email}
                    className="rounded-full border border-bsy-stone-200 px-3 py-1 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50 disabled:opacity-50"
                  >
                    שלח איפוס סיסמה
                  </button>
                  {ownsContent && !isMe ? (
                    <button
                      type="button"
                      onClick={() => cleanupOwnership(m)}
                      disabled={busyId === m.id}
                      title="מעביר חידונים אליי ומשחרר משחקים מהמארח"
                      className="rounded-full border border-bsy-stone-200 px-3 py-1 text-[12px] font-bold text-bsy-stone-700 hover:bg-bsy-stone-50 disabled:opacity-50"
                    >
                      העבר תכנים אליי
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => deleteMember(m)}
                    disabled={busyId === m.id || isMe || ownsContent}
                    title={
                      isMe
                        ? "לא ניתן למחוק את עצמך"
                        : ownsContent
                          ? "המשתמש בבעלות על חידונים/משחקים — לחץ ׳העבר תכנים אליי׳ קודם"
                          : undefined
                    }
                    className="rounded-full border border-red-200 px-3 py-1 text-[12px] font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                  >
                    מחק
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
