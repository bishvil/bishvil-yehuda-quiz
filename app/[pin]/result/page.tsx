import { notFound } from "next/navigation";

import { ResultScreen } from "./result-screen";
import { getAuthenticatedClaims } from "@/src/lib/auth/server-auth";
import { findAnySessionByPin } from "@/src/lib/sessions/lookup";
import { resolveParticipantBrand } from "@/src/lib/participant/brands";
import { buildDisplayName } from "@/src/lib/participant/identity";
import { isValidParticipantPin } from "@/src/lib/participant/pin";
import {
  PARTICIPANT_LEADERBOARD_LIMIT,
  DEFAULT_QUESTION_POINTS,
} from "@/src/lib/constants";
import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/src/lib/supabase/server";
import type { ParticipantBrand } from "@/src/lib/participant/brands";

export const dynamic = "force-dynamic";

interface ResultPageProps {
  params: Promise<{ pin: string }>;
}

export interface LeaderboardRowDto {
  participantId: string;
  displayName: string;
  score: number;
  isMe: boolean;
}

interface ResultPageData {
  pin: string;
  brand: ParticipantBrand;
  customLogo: string | null;
  customLogoLabel: string | null;
  quizTitle: string;
  questionCount: number;
  myScore: number;
  myCorrectCount: number;
  myStreak: number;
  myRank: number | null;
  leaderboard: LeaderboardRowDto[];
}

export default async function ParticipantResultPage({
  params,
}: ResultPageProps) {
  const { pin } = await params;

  if (!isValidParticipantPin(pin)) {
    notFound();
  }

  const data = await loadResultPageData(pin);
  if (!data) {
    notFound();
  }

  const maxScorePerQuestion = DEFAULT_QUESTION_POINTS;

  return (
    <ResultScreen
      pin={data.pin}
      brand={data.brand}
      customLogo={data.customLogo}
      customLogoLabel={data.customLogoLabel}
      quizTitle={data.quizTitle}
      questionCount={data.questionCount}
      maxScorePerQuestion={maxScorePerQuestion}
      myScore={data.myScore}
      myCorrectCount={data.myCorrectCount}
      myStreak={data.myStreak}
      myRank={data.myRank}
      leaderboard={data.leaderboard}
    />
  );
}

async function loadResultPageData(pin: string): Promise<ResultPageData | null> {
  const serviceSupabase = await createServiceRoleSupabaseClient();
  const { data: session } = await findAnySessionByPin(serviceSupabase, pin);
  if (!session) return null;

  const { data: quiz } = await serviceSupabase
    .from("quizzes")
    .select("title, brand_id, custom_logo, custom_logo_label, custom_logo_active")
    .eq("id", session.quiz_id)
    .maybeSingle();
  if (!quiz) return null;

  const { count: questionCount } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);

  const browserScopedSupabase = await createServerSupabaseClient();
  const claims = await getAuthenticatedClaims(browserScopedSupabase);
  const meParticipantId =
    claims?.role === "participant" && claims.sessionId === session.id
      ? claims.userId
      : null;

  // Fetch the leaderboard joined with display-safe participant rows.
  const { data: scoreRows } = await serviceSupabase
    .from("participant_scores")
    .select(
      "participant_id, total_score, correct_count, session_participants!inner(first_name, last_name, streak)",
    )
    .eq("session_id", session.id)
    .order("total_score", { ascending: false });

  type ScoreRow = {
    participant_id: string;
    total_score: number;
    correct_count: number;
    session_participants: {
      first_name: string;
      last_name: string;
      streak: number;
    };
  };

  const rankedRows: ScoreRow[] = (scoreRows ?? []) as unknown as ScoreRow[];

  let myScore = 0;
  let myCorrectCount = 0;
  let myStreak = 0;
  let myRank: number | null = null;

  rankedRows.forEach((row, index) => {
    if (row.participant_id === meParticipantId) {
      myScore = row.total_score;
      myCorrectCount = row.correct_count;
      myStreak = row.session_participants.streak;
      myRank = index + 1;
    }
  });

  const board: LeaderboardRowDto[] = rankedRows
    .slice(0, PARTICIPANT_LEADERBOARD_LIMIT)
    .map((row) => ({
      participantId: row.participant_id,
      displayName: buildDisplayName({
        firstName: row.session_participants.first_name,
        lastName: row.session_participants.last_name,
      }),
      score: row.total_score,
      isMe: row.participant_id === meParticipantId,
    }));

  // If the user isn't in the top N, splice them in at their actual rank.
  if (
    meParticipantId &&
    myRank !== null &&
    !board.some((row) => row.isMe)
  ) {
    const meRow = rankedRows[myRank - 1];
    if (meRow) {
      board.push({
        participantId: meRow.participant_id,
        displayName: buildDisplayName({
          firstName: meRow.session_participants.first_name,
          lastName: meRow.session_participants.last_name,
        }),
        score: meRow.total_score,
        isMe: true,
      });
    }
  }

  const brand = await resolveParticipantBrand(serviceSupabase, quiz.brand_id);
  const effectiveLogo = quiz.custom_logo_active ? quiz.custom_logo : null;

  return {
    pin: session.pin,
    brand,
    customLogo: effectiveLogo,
    customLogoLabel: effectiveLogo ? quiz.custom_logo_label : null,
    quizTitle: quiz.title,
    questionCount: questionCount ?? 0,
    myScore,
    myCorrectCount,
    myStreak,
    myRank,
    leaderboard: board,
  };
}
