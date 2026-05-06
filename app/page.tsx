import Image from "next/image";
import Link from "next/link";
import PinEntryForm from "@/src/components/landing/PinEntryForm";
import LogoCarousel from "@/src/components/landing/LogoCarousel";

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
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
        >
          התחברות
        </Link>
      </header>

      <main>
        {/* ── Hero section ──────────────────────────────────────────── */}
        <section
          className="relative flex flex-col overflow-hidden"
          style={{
            background: "var(--bsy-paper)",
            minHeight: "calc(100svh - 73px)",
          }}
        >
          {/* SVG landscape — fills the bottom half of the hero exactly */}
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            aria-hidden="true"
            style={{ height: "50%" }}
          >
            <svg
              viewBox="0 0 1000 200"
              preserveAspectRatio="xMidYMax slice"
              className="absolute inset-0 w-full h-full"
            >
              {/* far ridge — sage */}
              <path
                d="M0 100 L150 65 L325 88 L525 55 L725 78 L900 62 L1000 72 L1000 200 L0 200 Z"
                fill="#90B090"
                opacity="0.7"
              />
              {/* mid ridge — tan/earth */}
              <path
                d="M0 130 L175 105 L350 125 L525 95 L715 120 L875 108 L1000 115 L1000 200 L0 200 Z"
                fill="#C8A078"
                opacity="0.8"
              />
              {/* near ridge — bright green */}
              <path
                d="M0 160 L200 135 L410 158 L625 128 L825 152 L1000 142 L1000 200 L0 200 Z"
                fill="#8CC83C"
                opacity="0.9"
              />
              {/* walking-path swoosh */}
              <path
                d="M-25 185 Q 250 168, 500 178 T 1025 175"
                stroke="#FAF7F0"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                opacity="0.7"
              />
            </svg>
          </div>

          {/* Top half — titles centered vertically + horizontally */}
          <div className="relative z-10 flex flex-1 items-center justify-center px-6 pt-6 text-center">
            <div className="flex flex-col items-center">
              <h1 className="m-0 leading-[1]">
                <span
                  className="block"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    fontSize: "clamp(3rem, 11vw, 6.25rem)",
                    color: "var(--bsy-brown-deep)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  בשביל יהודה
                </span>
                <span
                  className="mt-2 block md:mt-3"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    fontSize: "clamp(2.1rem, 7.6vw, 4.4rem)",
                    color: "var(--bsy-green-forest)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  חידון מורשת
                </span>
              </h1>

              <div
                className="mt-6 flex items-center gap-3 md:mt-8"
                aria-hidden="true"
              >
                <span
                  style={{
                    width: "clamp(32px, 6vw, 64px)",
                    height: "1px",
                    background: "var(--bsy-stone-200)",
                  }}
                />
                <p
                  className="m-0"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "clamp(0.875rem, 2.6vw, 1.1rem)",
                    fontWeight: 500,
                    color: "var(--bsy-stone-700)",
                    letterSpacing: "0.06em",
                  }}
                >
                  מורשת בדרך ערך
                </p>
                <span
                  style={{
                    width: "clamp(32px, 6vw, 64px)",
                    height: "1px",
                    background: "var(--bsy-stone-200)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Bottom half — PIN centered over the mountains, biased down */}
          <div className="relative z-10 flex flex-1 items-center justify-center px-6 pt-[15%] pb-6">
            <PinEntryForm />
          </div>
        </section>

        {/* ── Regional logos / brand row ────────────────────────────── */}
        <LogoCarousel />

        {/* ── Feature callouts ──────────────────────────────────────── */}
        <section
          className="py-16 px-6 md:py-20"
          style={{ background: "var(--color-bg-elevated)" }}
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
                  background: "var(--bsy-paper)",
                  border: "1px solid var(--bsy-stone-100)",
                }}
              >
                <h3
                  className="font-display mb-2"
                  style={{
                    fontSize: "1.4rem",
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
