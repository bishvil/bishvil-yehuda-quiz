import Image from "next/image";
import Link from "next/link";
import PinEntryForm from "@/src/components/landing/PinEntryForm";

/**
 * Landing page — Hebrew/RTL public face of "בשביל יהודה — חידון מורשת"
 * Server component. Only the PinEntryForm (client island) requires router.push.
 */
export default function HomePage() {
  return (
    <>
      {/* ── Site header ──────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-5 py-3 sticky top-0 z-10"
        style={{
          background: "rgba(250, 247, 240, 0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--bsy-stone-100)",
        }}
      >
        <Image
          src="/logos/logo_yehuda.png"
          alt="בשביל יהודה"
          width={120}
          height={56}
          className="h-12 w-auto object-contain"
          priority
        />
        <Link
          href="/login"
          style={{
            borderRadius: "var(--radius-pill)",
            background: "var(--bsy-green-forest)",
            color: "var(--bsy-paper)",
            fontWeight: 600,
            padding: "0.45rem 1.25rem",
            fontSize: "0.9375rem",
            textDecoration: "none",
            display: "inline-block",
            transition:
              "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseOver={undefined}
        >
          התחברות
        </Link>
      </header>

      <main>
        {/* ── Hero section ──────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden"
          style={{ background: "var(--bsy-paper-warm)" }}
        >
          {/* SVG landscape background — adapted from brand ui_kits/website/Hero.jsx */}
          <div
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
            style={{ pointerEvents: "none" }}
          >
            <svg
              viewBox="0 0 400 300"
              preserveAspectRatio="xMidYMax slice"
              className="absolute bottom-0 left-0 w-full h-full"
            >
              <defs>
                <linearGradient id="bsy-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FAF7F0" />
                  <stop offset="100%" stopColor="#F4ECDC" />
                </linearGradient>
              </defs>
              <rect width="400" height="300" fill="url(#bsy-sky)" />
              {/* far ridge — sage */}
              <path
                d="M0 200 L60 165 L130 188 L210 155 L290 178 L360 162 L400 172 L400 300 L0 300 Z"
                fill="#90B090"
                opacity="0.7"
              />
              {/* mid ridge — tan/earth */}
              <path
                d="M0 230 L70 205 L140 225 L210 195 L285 220 L350 208 L400 215 L400 300 L0 300 Z"
                fill="#C8A078"
                opacity="0.8"
              />
              {/* near ridge — bright green */}
              <path
                d="M0 260 L80 235 L165 258 L250 228 L330 252 L400 242 L400 300 L0 300 Z"
                fill="#8CC83C"
                opacity="0.9"
              />
              {/* walking-path swoosh */}
              <path
                d="M-10 285 Q 100 268, 200 278 T 410 275"
                stroke="#FAF7F0"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
          </div>

          {/* Hero content */}
          <div
            className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-36"
            style={{ maxWidth: "680px", margin: "0 auto" }}
          >
            <span
              className="inline-block mb-4 text-xs font-bold tracking-widest uppercase"
              style={{ color: "var(--bsy-green-forest)" }}
            >
              חידון מורשת אינטראקטיבי
            </span>

            {/* Main headline — Heebo body font at black weight for quiz-platform feel */}
            <h1
              className="mb-4"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 900,
                fontSize: "clamp(2rem, 8vw, 3.5rem)",
                lineHeight: 1.1,
                color: "var(--bsy-brown)",
                letterSpacing: "-0.02em",
              }}
            >
              בשביל יהודה
              <br />
              <span style={{ color: "var(--bsy-green-forest)" }}>
                חידון מורשת
              </span>
            </h1>

            {/* Tagline — BA Hamossad / hand-style accent font */}
            <p
              className="mb-8"
              style={{
                fontFamily: "var(--font-hand)",
                fontSize: "clamp(1.1rem, 4vw, 1.5rem)",
                color: "var(--bsy-green-forest)",
                letterSpacing: "0.01em",
              }}
            >
              ״מורשת בדרך ערך״
            </p>

            <p
              className="mb-10"
              style={{
                fontSize: "1.0625rem",
                color: "var(--bsy-stone-700)",
                lineHeight: 1.7,
                maxWidth: "480px",
              }}
            >
              פלטפורמת חידונים חיה למדריכים ולמשתתפים — כל שאלה היא תחנה במסלול
              המורשת של ארץ ישראל
            </p>

            {/* Primary CTA */}
            <div className="flex flex-col items-center gap-4 w-full mb-10">
              <Link
                href="/login"
                style={{
                  borderRadius: "var(--radius-pill)",
                  background: "var(--bsy-green-forest)",
                  color: "var(--bsy-paper)",
                  fontWeight: 700,
                  padding: "0.75rem 2.5rem",
                  fontSize: "1.0625rem",
                  textDecoration: "none",
                  display: "inline-block",
                  boxShadow: "var(--shadow-md)",
                  transition:
                    "background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
                }}
              >
                התחברות — מארח / מנהל
              </Link>
            </div>

            {/* PIN entry divider */}
            <div
              className="w-full flex items-center gap-4 mb-6"
              style={{ maxWidth: "340px" }}
            >
              <div
                className="flex-1"
                style={{
                  height: "1px",
                  background: "var(--bsy-stone-200)",
                }}
              />
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--bsy-stone-400)",
                  whiteSpace: "nowrap",
                }}
              >
                או הצטרפו כמשתתפים
              </span>
              <div
                className="flex-1"
                style={{
                  height: "1px",
                  background: "var(--bsy-stone-200)",
                }}
              />
            </div>

            {/* Inline PIN form — client island */}
            <PinEntryForm />
          </div>
        </section>

        {/* ── Regional logos / brand row ────────────────────────────── */}
        <section
          className="py-12 px-6"
          style={{ background: "var(--bsy-paper)" }}
          aria-label="מסלולי בשביל"
        >
          <p
            className="text-center mb-8 text-xs font-bold tracking-widest uppercase"
            style={{ color: "var(--bsy-stone-400)" }}
          >
            המסלולים שלנו
          </p>
          <ul
            className="flex flex-wrap justify-center items-center gap-8 list-none p-0 m-0"
            role="list"
          >
            {[
              { src: "/logos/logo_main.png", alt: "בשביל — מסלול ראשי" },
              { src: "/logos/logo_yehuda.png", alt: "בשביל יהודה" },
              { src: "/logos/logo_haari.png", alt: "בשביל הארי" },
              { src: "/logos/logo_tzafon.png", alt: "בשביל הצפון" },
              { src: "/logos/logo_etzion.jpeg", alt: "בשביל עציון" },
              { src: "/logos/logo_haganat.png", alt: "בשביל הגנת היישוב" },
            ].map((logo) => (
              <li key={logo.src}>
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={80}
                  height={80}
                  className="h-16 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
                  style={{ transition: "opacity var(--dur-base) var(--ease-out)" }}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ── Feature callouts ──────────────────────────────────────── */}
        <section
          className="py-12 px-6"
          style={{ background: "var(--bsy-paper-warm)" }}
        >
          <div
            className="grid gap-6"
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {[
              {
                title: "חידון חי",
                body: "שאלות מוקרנות בזמן אמת — כל תחנה במסלול הופכת לחוויית למידה",
              },
              {
                title: "מפה אינטראקטיבית",
                body: "שאלות מיקום על גבי מפת ארץ ישראל — המשתתפים מדייקים את התשובה בעזרת אצבע",
              },
              {
                title: "תוצאות מיידיות",
                body: "ניקוד, דירוג, ותובנות למדריך — בסיום כל שאלה ובסוף המסלול",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="p-6"
                style={{
                  borderRadius: "var(--radius-lg)",
                  background: "var(--color-bg-elevated)",
                  boxShadow: "var(--shadow-sm)",
                  border: "1px solid var(--bsy-stone-100)",
                }}
              >
                <h3
                  className="font-display mb-2"
                  style={{
                    fontSize: "1.25rem",
                    color: "var(--bsy-brown)",
                  }}
                >
                  {card.title}
                </h3>
                <p
                  className="m-0"
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--bsy-stone-700)",
                    lineHeight: 1.65,
                  }}
                >
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="py-10 px-6 text-center"
        style={{
          background: "var(--bsy-green-forest)",
          color: "var(--bsy-paper)",
        }}
      >
        <Image
          src="/logos/logo_yehuda.png"
          alt="בשביל יהודה"
          width={80}
          height={80}
          className="h-14 w-auto object-contain mx-auto mb-4 opacity-90"
        />
        <p
          className="font-hand mb-2"
          style={{
            fontSize: "1rem",
            color: "var(--bsy-green-light)",
          }}
        >
          ״מורשת בדרך ערך״
        </p>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "rgba(250, 247, 240, 0.55)",
            margin: 0,
          }}
        >
          &copy; {new Date().getFullYear()} בשביל יהודה — כל הזכויות שמורות
        </p>
      </footer>
    </>
  );
}
