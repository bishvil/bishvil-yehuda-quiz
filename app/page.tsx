import Image from "next/image";
import Link from "next/link";
import PinEntryForm from "@/src/components/landing/PinEntryForm";
import LogoCarousel from "@/src/components/landing/LogoCarousel";
import RotatingRegion from "@/src/components/landing/RotatingRegion";

/**
 * Landing page — Hebrew/RTL public face of "בשביל יהודה — חידון מורשת"
 * Server component. Only the PinEntryForm (client island) requires router.push.
 */
export default function HomePage() {
  return (
    <>
      <main>
        {/* ── Hero section ──────────────────────────────────────────── */}
        <section
          className="relative flex h-[100svh] overflow-hidden"
          style={{
            background: "var(--bsy-paper)",
          }}
        >
          <Image
            src="/images/home-hero-bg.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[82%_center] opacity-85 saturate-[0.82] contrast-[0.92] md:object-[70%_center] md:opacity-80"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              background:
                "linear-gradient(180deg, rgba(250, 247, 240, 0.6) 0%, rgba(250, 247, 240, 0.3) 45%, rgba(244, 236, 220, 0.45) 88%, rgba(244, 236, 220, 1) 100%)",
            }}
          />
          <Link
            href="/login"
            aria-label="כניסה"
            title="כניסה"
            className="absolute left-4 top-4 z-20 inline-flex size-10 items-center justify-center md:left-6 md:top-6 md:size-11"
            style={{
              borderRadius: "var(--radius-pill)",
              background: "rgba(250, 247, 240, 0.88)",
              color: "var(--bsy-green-forest)",
              textDecoration: "none",
              border: "1px solid rgba(48, 96, 48, 0.22)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
            </svg>
          </Link>

          <div
            className="relative z-10 mx-auto flex w-full flex-col items-center justify-between gap-12 px-5 py-12 text-center md:py-12"
            style={{ maxWidth: "1120px" }}
          >
            <div className="mt-10 flex flex-col items-center md:mt-0">
              <Image
                src="/logos/logo_main.png"
                alt="בשביל יהודה"
                width={164}
                height={140}
                className="mb-6 h-[4.7rem] w-auto object-contain md:mb-8 md:h-[6.5rem]"
                style={{ width: "auto" }}
                priority
              />
              <h1 className="m-0 leading-[1]">
                <span
                  className="block text-[3.1rem] sm:text-[4.5rem] md:text-[5.75rem]"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    color: "var(--bsy-brown-deep)",
                    letterSpacing: 0,
                    textShadow: "0 2px 16px rgba(250, 247, 240, 0.72)",
                  }}
                >
                  בשביל
                </span>
                <span
                  className="block text-[3.1rem] sm:text-[4.5rem] md:text-[5.75rem] leading-[1.05]"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    color: "var(--bsy-brown-deep)",
                    letterSpacing: 0,
                    textShadow: "0 2px 16px rgba(250, 247, 240, 0.72)",
                  }}
                >
                  <RotatingRegion />
                </span>
                <span
                  className="mt-1 block text-[2.15rem] sm:text-[3.2rem] md:mt-3 md:text-[4rem]"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 400,
                    color: "var(--bsy-green-forest)",
                    letterSpacing: 0,
                    textShadow: "0 2px 16px rgba(250, 247, 240, 0.72)",
                  }}
                >
                  חידון מורשת
                </span>
              </h1>
            </div>
            <PinEntryForm />
          </div>
        </section>

        {/* ── Regional logos / brand row ────────────────────────────── */}
        <LogoCarousel />

        {/* ── Manifesto band ────────────────────────────────────────── */}
        <section
          className="manifesto"
          aria-label="על בשביל יהודה"
          style={{ background: "var(--bsy-paper)" }}
        >
          <div className="manifesto__inner">
            <p className="manifesto__text font-hand">
              <span className="manifesto__line">כל מקום הוא שאלה</span>
              <span className="manifesto__line">כל שאלה היא שביל</span>
              <span className="manifesto__line">שביל אל סיפור מורשת</span>
            </p>
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
