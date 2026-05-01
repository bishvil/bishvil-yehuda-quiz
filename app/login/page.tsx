import Image from "next/image";
import Link from "next/link";
import LoginForm from "./login-form";

/**
 * Login page — Hebrew/RTL sign-in for host and admin users.
 * Two-segment (מארח / מנהל) form wired to existing API routes.
 * Thin server wrapper; LoginForm is the client island.
 */
export default function LoginPage() {
  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bsy-paper)" }}
    >
      {/* ── Back link header ──────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: "rgba(250, 247, 240, 0.95)",
          borderBottom: "1px solid var(--bsy-stone-100)",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: "0.9375rem",
            color: "var(--bsy-green-forest)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            fontWeight: 500,
          }}
          aria-label="חזרה לדף הבית"
        >
          {/* Arrow pointing right (RTL = "back") */}
          <span aria-hidden="true">→</span>
          חזרה
        </Link>
        <Image
          src="/logos/logo_yehuda.png"
          alt="בשביל יהודה"
          width={96}
          height={48}
          className="h-10 w-auto object-contain"
          priority
        />
      </header>

      {/* ── Login card ────────────────────────────────────────────── */}
      <main
        className="flex-1 flex items-center justify-center px-5 py-12"
      >
        <div
          className="w-full"
          style={{
            maxWidth: "460px",
            background: "var(--color-bg-elevated)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-lg)",
            padding: "clamp(1.5rem, 5vw, 2.5rem)",
            border: "1px solid var(--bsy-stone-100)",
          }}
        >
          {/* Card heading */}
          <div className="text-center mb-8">
            <h1
              className="font-display mb-2"
              style={{
                fontSize: "clamp(1.5rem, 5vw, 2rem)",
                color: "var(--bsy-brown)",
              }}
            >
              כניסה לפלטפורמה
            </h1>
            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--bsy-stone-700)",
                margin: 0,
              }}
            >
              בשביל יהודה — חידון מורשת אינטראקטיבי
            </p>
          </div>

          {/* The client form island */}
          <LoginForm />

          {/* Participant hint */}
          <p
            className="text-center mt-6"
            style={{
              fontSize: "0.8125rem",
              color: "var(--bsy-stone-400)",
            }}
          >
            משתתף?{" "}
            <Link
              href="/"
              style={{
                color: "var(--bsy-green-forest)",
                fontWeight: 600,
              }}
            >
              הכנס קוד PIN בדף הבית
            </Link>
          </p>
        </div>
      </main>

      {/* ── Minimal footer ────────────────────────────────────────── */}
      <footer
        className="text-center py-5 px-5"
        style={{
          borderTop: "1px solid var(--bsy-stone-100)",
        }}
      >
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--bsy-stone-400)",
            margin: 0,
          }}
        >
          &copy; {new Date().getFullYear()} בשביל יהודה
          <span
            className="mx-2"
            style={{ color: "var(--bsy-stone-200)" }}
            aria-hidden="true"
          >
            |
          </span>
          <span
            style={{
              fontFamily: "var(--font-hand)",
              color: "var(--bsy-green-forest)",
            }}
          >
            ״מורשת בדרך ערך״
          </span>
        </p>
      </footer>
    </div>
  );
}
