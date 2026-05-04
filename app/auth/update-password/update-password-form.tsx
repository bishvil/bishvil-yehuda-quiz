"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MIN_PASSWORD_LENGTH } from "@/src/lib/auth/validation";
import { createBrowserSupabaseClient } from "@/src/lib/supabase/browser";

type Status = "loading" | "ready" | "saving" | "saved" | "error" | "no-session";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Recovery links open with #access_token=...&type=recovery in the URL
      // hash. @supabase/ssr exchanges that into a session and emits
      // PASSWORD_RECOVERY. Either path means we have a usable session.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session ? "ready" : "no-session");
    })();
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStatus("ready");
      }
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים.`);
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות.");
      return;
    }
    setStatus("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setStatus("error");
      setError(updateError.message);
      return;
    }
    setStatus("saved");
    setTimeout(() => router.push("/login"), 1200);
  }

  if (status === "loading") {
    return (
      <p style={{ textAlign: "center", color: "var(--bsy-stone-700)" }}>
        טוען…
      </p>
    );
  }

  if (status === "no-session") {
    return (
      <p style={{ textAlign: "center", color: "var(--bsy-error)" }}>
        קישור האיפוס לא תקף או שפג תוקפו. נא לבקש קישור חדש.
      </p>
    );
  }

  if (status === "saved") {
    return (
      <p style={{ textAlign: "center", color: "var(--bsy-green-forest)" }}>
        הסיסמה עודכנה. מעביר לכניסה…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
          סיסמה חדשה
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          dir="ltr"
          style={{
            borderRadius: "var(--radius-md)",
            border: "2px solid var(--bsy-stone-200)",
            padding: "0.65rem 1rem",
            fontSize: "1rem",
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
          אימות סיסמה
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          dir="ltr"
          style={{
            borderRadius: "var(--radius-md)",
            border: "2px solid var(--bsy-stone-200)",
            padding: "0.65rem 1rem",
            fontSize: "1rem",
          }}
        />
      </label>
      {error ? (
        <p
          role="alert"
          style={{
            fontSize: "0.9rem",
            color: "var(--bsy-error)",
            background: "rgba(165, 58, 42, 0.08)",
            borderRadius: "var(--radius-sm)",
            padding: "0.5rem 0.75rem",
            margin: 0,
          }}
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "saving"}
        style={{
          borderRadius: "var(--radius-pill)",
          background: "var(--bsy-green-forest)",
          color: "var(--bsy-paper)",
          fontWeight: 700,
          padding: "0.75rem 2rem",
          fontSize: "1rem",
          border: "none",
          cursor: status === "saving" ? "not-allowed" : "pointer",
          opacity: status === "saving" ? 0.55 : 1,
        }}
      >
        {status === "saving" ? "שומר…" : "שמירת סיסמה חדשה"}
      </button>
    </form>
  );
}
