"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BrandBlock } from "@/src/components/participant/BrandBlock";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { useParticipantState } from "@/src/lib/hooks/useParticipantState";
import type { GameMode } from "@/src/lib/constants";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

interface LobbyScreenProps {
  pin: string;
  brand: ParticipantBrand;
  quizTitle: string;
  customLogo: string | null;
  customLogoLabel: string | null;
  questionCount: number;
  gameMode: GameMode;
}

/**
 * Lobby — sync mode shows a "waiting for host" pulse animation while the
 * session waits to go live (status === "scheduled" / "paused"). Once the
 * host starts and a question is presenting/answering, we navigate to /play.
 *
 * Async mode shows a "ready when you are" prompt. Tapping the primary CTA
 * navigates to /play; the participant's first progress row is bootstrapped
 * by the /state route on the play screen's first poll.
 */
export function LobbyScreen({
  pin,
  brand,
  quizTitle,
  customLogo,
  customLogoLabel,
  questionCount,
  gameMode,
}: LobbyScreenProps) {
  const router = useRouter();
  const { state } = useParticipantState({ pin });

  // Auto-navigate on host signal.
  useEffect(() => {
    if (!state) return;
    if (state.session.status === "ended") {
      router.replace(`/${pin}/result`);
      return;
    }
    if (
      state.question &&
      ["presenting", "answering", "locked", "revealed"].includes(
        state.question.status,
      )
    ) {
      router.replace(`/${pin}/play`);
    }
  }, [state, pin, router]);

  function handleManualStart() {
    router.replace(`/${pin}/play`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-bsy-paper px-6 pb-8 pt-10 text-center">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <BrandBlock
          brand={brand}
          customLogo={customLogo}
          customLogoLabel={customLogoLabel}
          size="sm"
          showTagline={false}
        />

        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
          {gameMode === "sync" ? "ממתינים למדריך" : "מוכנים להתחיל"}
        </p>

        <h2 className="m-0 font-[var(--font-display)] text-[32px] text-bsy-brown">
          ברוכים הבאים
        </h2>
        <p className="m-0 -mt-4 text-[14px] text-bsy-stone-700">{quizTitle}</p>

        <div
          aria-hidden="true"
          className="flex h-22 w-22 items-center justify-center rounded-full bg-bsy-lime text-bsy-forest-deep shadow-[0_0_0_6px_rgba(160,192,64,0.18)]"
          style={{ height: 88, width: 88 }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <path
              d="M20 4 L24 16 L36 18 L24 22 L20 36 L16 22 L4 18 L16 16 Z"
              fill="currentColor"
              opacity="0.85"
            />
          </svg>
        </div>

        <div className="text-[13px] text-bsy-stone-700">
          {gameMode === "sync" ? (
            <>
              ממתינים שהמדריך יתחיל
              <span aria-hidden="true" className="ms-2 inline-flex gap-1">
                <Dot delay={0} />
                <Dot delay={150} />
                <Dot delay={300} />
              </span>
            </>
          ) : (
            "בקצב שלכם — אפשר להתחיל מתי שמוכנים"
          )}
        </div>

        {gameMode === "async" ? (
          <PrimaryButton variant="primary" block withArrow onClick={handleManualStart}>
            להתחלת המסלול
          </PrimaryButton>
        ) : null}

        <dl className="mt-auto grid w-full grid-cols-2 gap-2 rounded-md border border-bsy-stone-100 bg-white px-4 py-3 text-start">
          <div className="flex flex-col">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-bsy-stone-400">
              תחנות
            </dt>
            <dd className="m-0 font-[var(--font-display)] text-lg text-bsy-brown">
              {questionCount}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-bsy-stone-400">
              זמן משוער
            </dt>
            <dd className="m-0 font-[var(--font-display)] text-lg text-bsy-brown">
              {Math.max(1, Math.round((questionCount * 25) / 60))} דק׳
            </dd>
          </div>
        </dl>
      </div>
    </main>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-bsy-forest"
      style={{
        animation: "bsy-dot 1.2s infinite ease-in-out",
        animationDelay: `${delay}ms`,
        opacity: 0.4,
      }}
    />
  );
}
