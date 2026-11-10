import Link from "next/link";

import { BrandBlock } from "@/src/components/participant/BrandBlock";
import { Leaderboard } from "@/src/components/participant/Leaderboard";
import { ScoreCircle } from "@/src/components/participant/ScoreCircle";
import { Spark } from "@/src/components/illustrations/Spark";
import type { ParticipantBrand } from "@/src/lib/participant/brands";
import type { PersonalAnswerReview } from "@/src/lib/participant/answer-review";
import type { LeaderboardRowDto } from "./page";

interface ResultScreenProps {
  pin: string;
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  quizTitle: string;
  questionCount: number;
  maxScorePerQuestion: number;
  maxTotalScore?: number;
  myScore: number;
  myCorrectCount: number;
  myStreak: number;
  myRank: number | null;
  leaderboard: LeaderboardRowDto[];
  review?: PersonalAnswerReview[];
}

export function ResultScreen({
  pin,
  brand,
  customLogo,
  customLogoLabel,
  quizTitle,
  questionCount,
  maxScorePerQuestion,
  maxTotalScore: configuredMaxTotalScore,
  myScore,
  myCorrectCount,
  myStreak,
  myRank,
  leaderboard,
  review = [],
}: ResultScreenProps) {
  const maxTotalScore = Math.max(
    1,
    configuredMaxTotalScore ?? questionCount * maxScorePerQuestion,
  );
  const accuracyPercent =
    questionCount > 0 ? Math.round((myCorrectCount / questionCount) * 100) : 0;
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

        {questionCount > 0 ? (
          <>
            <ScoreCircle score={myScore} maxScore={maxTotalScore} />

            <dl className="grid w-full grid-cols-3 gap-2">
              <Stat
                label="דירוג"
                value={myRank !== null ? `#${myRank}` : "—"}
              />
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
          </>
        ) : (
          <p className="w-full rounded-md border border-bsy-stone-200 bg-white p-5 text-sm leading-7 text-bsy-ink">
            עברתם את תחנות המידע במסלול. אין שאלות מנוקדות במסלול זה.
          </p>
        )}

        {review.length > 0 ? (
          <details className="w-full rounded-md border border-bsy-stone-200 bg-white p-4 text-start">
            <summary className="min-h-11 cursor-pointer text-center font-bold text-bsy-forest">
              סקירת התשובות שלי
            </summary>
            <ol className="mt-4 space-y-4">
              {review.map((item) => (
                <li
                  key={item.questionId}
                  className="rounded-md border border-bsy-stone-100 bg-bsy-paper p-4 text-sm leading-7"
                >
                  <p className="text-xs font-bold text-bsy-stone-700">
                    תחנה {item.index} · {REVIEW_OUTCOMES[item.outcome]}
                  </p>
                  {item.outcome === "information" ? (
                    <p className="mt-2 whitespace-pre-wrap font-[var(--font-body)] leading-8 text-bsy-ink">
                      {item.prompt}
                    </p>
                  ) : (
                    <h3
                      style={{ fontFamily: "var(--font-body)" }}
                      className="mt-1 whitespace-pre-wrap text-base font-bold leading-7 text-bsy-brown"
                    >
                      {item.prompt}
                    </h3>
                  )}
                  {item.outcome !== "information" ? (
                    <>
                      <p className="mt-2">
                        התשובה שלכם: {item.submittedAnswer ?? "לא נשלחה תשובה"}
                      </p>
                      {item.correctAnswer ? (
                        <p>
                          תשובה קבילה: <b>{item.correctAnswer}</b>
                        </p>
                      ) : null}
                      {item.mapTargetUrl ? (
                        <a
                          className="inline-flex min-h-11 items-center font-bold text-bsy-forest underline"
                          href={item.mapTargetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          צפייה במיקום הנכון במפה
                        </a>
                      ) : null}
                      {item.distanceKm != null ? (
                        <p>מרחק מהיעד: {item.distanceKm.toFixed(2)} ק״מ</p>
                      ) : null}
                      <p className="font-bold">
                        {item.score} מתוך {item.maxScore} נקודות
                      </p>
                    </>
                  ) : null}
                  {item.explanation ? (
                    <p className="mt-2 whitespace-pre-wrap">
                      {item.explanation}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <Link
          href={`/${pin}`}
          className="flex min-h-11 w-full items-center justify-center rounded-full border border-bsy-stone-200 bg-white px-5 py-3 text-sm font-bold text-bsy-forest"
        >
          חזרה למסך ההצטרפות
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

const REVIEW_OUTCOMES: Record<PersonalAnswerReview["outcome"], string> = {
  correct: "תשובה נכונה",
  partial: "נכון חלקית",
  incorrect: "תשובה שגויה",
  missed: "לא נענתה",
  information: "קטע מידע · ללא ניקוד",
};
