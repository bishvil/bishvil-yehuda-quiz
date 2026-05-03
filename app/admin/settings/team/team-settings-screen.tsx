"use client";

import { useEffect, useState } from "react";

import { AdminTopBar } from "@/src/components/admin/AdminTopBar";

import type { TeamMemberRow } from "@/app/api/admin/team/route";

const ROLE_LABELS: Record<TeamMemberRow["role"], string> = {
  admin: "מנהל",
  host: "מארח",
};

export function TeamSettingsScreen() {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"host" | "admin">("host");
  const [inviteState, setInviteState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/team", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { members: TeamMemberRow[] };
        if (cancelled) return;
        setMembers(body.members);
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

  async function toggleRole(member: TeamMemberRow) {
    const next = member.role === "admin" ? "host" : "admin";
    setBusyId(member.id);
    try {
      const res = await fetch("/api/admin/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: member.id, role: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { member: TeamMemberRow };
      setMembers((prev) =>
        prev.map((m) => (m.id === body.member.id ? body.member : m)),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteState("sending");
    setInviteError(null);
    try {
      const res = await fetch("/api/admin/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errBody?.message ?? `HTTP ${res.status}`);
      }
      setInviteState("sent");
      setInviteEmail("");
      setReloadTick((t) => t + 1);
      window.setTimeout(() => setInviteState("idle"), 2400);
    } catch (err) {
      setInviteError((err as Error).message);
      setInviteState("error");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bsy-paper">
      <AdminTopBar crumbs={[{ label: "הגדרות" }, { label: "צוות" }]} />

      <section className="mx-auto max-w-4xl px-4 py-6 md:px-6">
        <form
          onSubmit={submitInvite}
          className="mb-6 flex flex-col gap-3 rounded-md border border-bsy-stone-100 bg-white p-4 md:flex-row md:items-end"
        >
          <label className="flex grow flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
              אימייל
            </span>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-brown"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-bsy-stone-400">
              תפקיד
            </span>
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "host" | "admin")
              }
              className="rounded-md border border-bsy-stone-200 bg-white px-3 py-2 text-[14px] text-bsy-brown"
            >
              <option value="host">מארח</option>
              <option value="admin">מנהל</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={inviteState === "sending"}
            className="rounded-full bg-bsy-green-forest px-5 py-2 text-[13px] font-bold text-bsy-paper hover:opacity-90 disabled:opacity-50"
          >
            {inviteState === "sending"
              ? "שולח…"
              : inviteState === "sent"
                ? "הזמנה נשלחה"
                : "הזמן חבר"}
          </button>
          {inviteState === "error" && inviteError ? (
            <span className="text-[12px] text-red-700">{inviteError}</span>
          ) : null}
        </form>

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
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 border-b border-bsy-stone-100 px-4 py-3 last:border-b-0"
              >
                <span className="grow text-[14px] text-bsy-brown" dir="ltr">
                  {m.email || m.id}
                </span>
                <span className="rounded-full bg-bsy-stone-50 px-3 py-1 text-[11px] font-bold text-bsy-stone-700">
                  {ROLE_LABELS[m.role]}
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
