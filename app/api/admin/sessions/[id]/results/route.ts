import { type NextRequest } from "next/server";

import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

interface AdminSessionResultsRouteContext {
  params: Promise<{ id: string }>;
}

interface AdminSessionResultPlayer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  unit: string | null;
  team: string | null;
  status: "joined" | "in_progress" | "completed";
  totalScore: number;
  correctCount: number;
  streak: number;
  joinedAt: string;
}

interface AdminSessionResultAnswer {
  questionId: string;
  participantId: string;
  submittedAt: string;
  selectedIds: string[] | null;
  pinX: string | null;
  pinY: string | null;
  isCorrect: boolean;
  score: number;
  timeBonus: number;
}

interface AdminSessionResultsBody {
  session: {
    id: string;
    pin: string;
    status: string;
    gameMode: string;
    startedAt: string | null;
    endedAt: string | null;
  };
  players: AdminSessionResultPlayer[];
  answers: AdminSessionResultAnswer[];
}

interface AdminSessionResultsErrorBody {
  error: "SESSION_NOT_FOUND" | "WRITE_FAILED";
  message: string;
}

/**
 * Admin sees full participant data including phone and full name per
 * ADR-0008 §5. Cache-Control: private, no-store.
 */
export async function GET(
  _request: NextRequest,
  context: AdminSessionResultsRouteContext,
) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await context.params;
  const serviceSupabase = await createServiceRoleSupabaseClient();

  const { data: session } = await serviceSupabase
    .from("sessions")
    .select("id, pin, status, game_mode, started_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return privateNoStoreJson<AdminSessionResultsErrorBody>(
      { error: "SESSION_NOT_FOUND", message: "Session not found." },
      { status: 404 },
    );
  }

  const [{ data: participants }, { data: scores }, { data: answers }] = await Promise.all([
    serviceSupabase
      .from("session_participants")
      .select(
        "id, first_name, last_name, phone, unit, team, status, streak, joined_at",
      )
      .eq("session_id", sessionId),
    serviceSupabase
      .from("participant_scores")
      .select("participant_id, total_score, correct_count")
      .eq("session_id", sessionId),
    serviceSupabase
      .from("answers")
      .select(
        "question_id, participant_id, submitted_at, selected_ids, pin_x, pin_y, is_correct, score, time_bonus",
      )
      .eq("session_id", sessionId),
  ]);

  const scoreById = new Map(
    (scores ?? []).map((row) => [row.participant_id, row]),
  );

  const players: AdminSessionResultPlayer[] = (participants ?? []).map((row) => {
    const score = scoreById.get(row.id);
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      unit: row.unit,
      team: row.team,
      status: row.status,
      totalScore: score?.total_score ?? 0,
      correctCount: score?.correct_count ?? 0,
      streak: row.streak,
      joinedAt: row.joined_at,
    };
  });

  const flattenedAnswers: AdminSessionResultAnswer[] = (answers ?? []).map(
    (row) => ({
      questionId: row.question_id,
      participantId: row.participant_id,
      submittedAt: row.submitted_at,
      selectedIds: row.selected_ids,
      pinX: row.pin_x,
      pinY: row.pin_y,
      isCorrect: row.is_correct,
      score: row.score,
      timeBonus: row.time_bonus,
    }),
  );

  return privateNoStoreJson<AdminSessionResultsBody>({
    session: {
      id: session.id,
      pin: session.pin,
      status: session.status,
      gameMode: session.game_mode,
      startedAt: session.started_at,
      endedAt: session.ended_at,
    },
    players,
    answers: flattenedAnswers,
  });
}
