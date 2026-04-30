import Link from "next/link";

import { BrandBlock } from "@/src/components/participant/BrandBlock";
import { Leaderboard } from "@/src/components/participant/Leaderboard";
import { PrimaryButton } from "@/src/components/participant/PrimaryButton";
import { ScoreCircle } from "@/src/components/participant/ScoreCircle";
import { Spark } from "@/src/components/illustrations/Spark";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { LeaderboardRowDto } from "./page";

interface ResultScreenProps {
  pin: string;
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  quizTitle: string;
  questionCount: number;
  maxScorePerQuestion: number;
  myScore: number;
  myCorrectCount: number;
  myStreak: number;
  myRank: number | null;
  leaderboard: LeaderboardRowDto[];
}

export function ResultScreen({
  pin,
  brand,
  customLogo,
  customLogoLabel,
  quizTitle,
  questionCount,
  maxScorePerQuestion,
  myScore,
  myCorrectCount,
  myStreak,
  myRank,
  leaderboard,
}: ResultScreenProps) {
  const maxTotalScore = Math.max(1, questionCount * maxScorePerQuestion);
  const accuracyPercent =
    questionCount > 0
      ? Math.round((myCorrectCount / questionCount) * 100)
      : 0;
  const headlineSubtitle = brand.tagline;

  return (
    <main
      className="flex min-h-screen flex-col items-center px-6 pb-8 pt-7 text-center"
      style={{
        background:
          "radial-gradient(ellipse 100% 50% at 50% 0%, rgba(180, 220, 100, 0.25) 0%, transparent 70%), var(--bsy-paper)",
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <BrandBlock
          brand={brand}
          customLogo={customLogo}
          customLogoLabel={customLogoLabel}
          size="sm"
          showTagline={false}
        />
        <Spark size={36} />
        <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bsy-forest">
          סיימתם את המסלול
        </p>
        <h2 className="m-0 font-[var(--font-display)] text-4xl text-bsy-brown">
          כל הכבוד
        </h2>
        <p className="m-0 -mt-2 text-[14px] text-bsy-stone-700">
          {quizTitle} · {headlineSubtitle}
        </p>

        <ScoreCircle score={myScore} maxScore={maxTotalScore} />

        <dl className="grid w-full grid-cols-3 gap-2">
          <Stat label="דירוג" value={myRank !== null ? `#${myRank}` : "—"} />
          <Stat label="רצף" value={`${myStreak}`} />
          <Stat label="דיוק" value={`${accuracyPercent}%`} />
        </dl>

        <Leaderboard
          entries={leaderboard.map((row) => ({
            participantId: row.participantId,
            displayName: row.displayName,
            score: row.score,
            isMe: row.isMe,
          }))}
        />

        <Link href={`/${pin}`} className="block w-full">
          <PrimaryButton variant="ghost" block>
            חזרה למסך ההצטרפות
          </PrimaryButton>
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-bsy-stone-100 bg-white px-2 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-bsy-stone-400">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 font-[var(--font-display)] text-[22px] text-bsy-brown">
        {value}
      </dd>
    </div>
  );
}
