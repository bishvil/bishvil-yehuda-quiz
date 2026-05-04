"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Segment = "host" | "admin";

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "host", label: "מארח" },
  { id: "admin", label: "מנהל" },
];

const SUCCESS_ROUTES: Record<Segment, string> = {
  host: "/host",
  admin: "/admin/quizzes",
};

const ERROR_MESSAGES: Record<number, string> = {
  400: "נא למלא את כל השדות כנדרש",
  401: "כתובת אימייל או סיסמה שגויים",
  422: "נא למלא את כל השדות כנדרש",
};

export default function LoginForm() {
  const [segment, setSegment] = useState<Segment>("host");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotState, setForgotState] = useState<
    "idle" | "sending" | "sent"
  >("idle");
  const router = useRouter();

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("נא להזין כתובת אימייל לשליחת קישור איפוס");
      return;
    }
    setError(null);
    setForgotState("sending");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // intentionally swallow — endpoint never returns failure to avoid enumeration
    } finally {
      setForgotState("sent");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push(SUCCESS_ROUTES[segment]);
        return;
      }

      const msg =
        ERROR_MESSAGES[res.status] ??
        "אירעה שגיאה בכניסה — אנא נסו שוב";
      setError(msg);
    } catch {
      setError("שגיאת חיבור — אנא בדקו את החיבור לרשת ונסו שוב");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-full"
      style={{ maxWidth: "420px", margin: "0 auto" }}
    >
      {/* Segmented control */}
      <div
        role="group"
        aria-label="סוג משתמש"
        className="flex mb-8"
        style={{
          borderRadius: "var(--radius-pill)",
          border: "2px solid var(--bsy-stone-200)",
          padding: "3px",
          background: "var(--bsy-stone-50)",
        }}
      >
        {SEGMENTS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSegment(id);
              setError(null);
            }}
            aria-pressed={segment === id}
            style={{
              flex: 1,
              borderRadius: "999px",
              border: "none",
              minHeight: "44px",
              padding: "0.55rem 1rem",
              fontSize: "1rem",
              fontWeight: segment === id ? 700 : 500,
              cursor: "pointer",
              transition: "background 220ms ease-out, color 220ms ease-out",
              background:
                segment === id
                  ? "var(--bsy-green-forest)"
                  : "transparent",
              color:
                segment === id
                  ? "var(--bsy-paper)"
                  : "var(--bsy-stone-700)",
              WebkitAppearance: "none",
              appearance: "none",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sign-in form */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Email field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="login-email"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--bsy-brown)",
            }}
          >
            כתובת אימייל
          </label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="you@example.com"
            style={{
              borderRadius: "var(--radius-md)",
              border: "2px solid var(--bsy-stone-200)",
              padding: "0.65rem 1rem",
              fontSize: "1rem",
              background: "var(--color-bg-elevated)",
              color: "var(--bsy-ink)",
              outline: "none",
              transition: "border-color 140ms ease-out",
              width: "100%",
              boxSizing: "border-box",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--bsy-green-forest)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--bsy-stone-200)")
            }
          />
        </div>

        {/* Password field */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="login-password"
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--bsy-brown)",
            }}
          >
            סיסמה
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            placeholder="••••••••"
            style={{
              borderRadius: "var(--radius-md)",
              border: "2px solid var(--bsy-stone-200)",
              padding: "0.65rem 1rem",
              fontSize: "1rem",
              background: "var(--color-bg-elevated)",
              color: "var(--bsy-ink)",
              outline: "none",
              transition: "border-color 140ms ease-out",
              width: "100%",
              boxSizing: "border-box",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--bsy-green-forest)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--bsy-stone-200)")
            }
          />
        </div>

        {/* Error message */}
        {error && (
          <p
            role="alert"
            style={{
              fontSize: "0.9375rem",
              color: "var(--bsy-error)",
              background: "rgba(165, 58, 42, 0.08)",
              borderRadius: "var(--radius-sm)",
              padding: "0.6rem 0.875rem",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !email || !password}
          style={{
            borderRadius: "var(--radius-pill)",
            background: "var(--bsy-green-forest)",
            color: "var(--bsy-paper)",
            fontWeight: 700,
            padding: "0.75rem 2rem",
            fontSize: "1.0625rem",
            border: "none",
            cursor:
              loading || !email || !password ? "not-allowed" : "pointer",
            opacity: loading || !email || !password ? 0.55 : 1,
            transition: "opacity 140ms ease-out",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            WebkitAppearance: "none",
            appearance: "none",
            width: "100%",
          }}
        >
          {loading ? "נכנס..." : "כניסה"}
        </button>

        <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
          {forgotState === "sent" ? (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--bsy-stone-700)",
              }}
            >
              אם הכתובת קיימת, נשלח אליה קישור איפוס.
            </span>
          ) : (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotState === "sending"}
              style={{
                background: "none",
                border: "none",
                color: "var(--bsy-green-forest)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor:
                  forgotState === "sending" ? "default" : "pointer",
                padding: 0,
              }}
            >
              {forgotState === "sending"
                ? "שולח קישור איפוס…"
                : "שכחתי סיסמה"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
