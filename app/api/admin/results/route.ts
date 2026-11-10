import { requireRole } from "@/src/lib/auth/server-auth";
import { privateNoStoreJson } from "@/src/lib/http/responses";
import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/server";

export interface ResultsListRow {
  id: string;
  pin: string;
  quizId: string;
  quizTitle: string;
  brandId: string;
  endedAt: string | null;
  status?: string;
  gameMode?: string;
  startedAt: string | null;
  participantCount: number;
  averageScore: number;
  topThree: {
    participantId: string;
    name: string;
    score: number;
  }[];
}

interface ResultsListBody {
  sessions: ResultsListRow[];
}

interface ResultsListErrorBody {
  error: "READ_FAILED";
  message: string;
}

/**
 * Cross-quiz results for ended sessions and open async sessions, with stats for
 * the `/admin/results` page. The detailed per-session drill-down still
 * lives at `/admin/quizzes/[quizId]/sessions/[sessionId]/results`.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  interface EndedSessionRow {
    id: string;
    pin: string;
    quiz_id: string;
    ended_at: string | null;
    status: string;
    game_mode: string;
    started_at: string | null;
    quizzes: { title: string; brand_id: string } | null;
  }

  interface ScoreRow {
    session_id: string;
    participant_id: string;
    total_score: number;
    session_participants: { first_name: string; last_name: string } | null;
  }

  const supabase = await createServiceRoleSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase
    .from("sessions")
    .select(
      "id, pin, quiz_id, status, game_mode, ended_at, started_at, quizzes(title, brand_id)",
    )
    .or("status.eq.ended,and(game_mode.eq.async,status.in.(live,paused))")
    .order("created_at", { ascending: false })
    .limit(50);

  if (sessionError) {
    return privateNoStoreJson<ResultsListErrorBody>(
      { error: "READ_FAILED", message: "Failed to list ended sessions." },
      { status: 500 },
    );
  }

  const rows = (sessionData ?? []) as unknown as EndedSessionRow[];
  const sessionIds = rows.map((r) => r.id);

  // Pull `participant_scores` joined with `session_participants` for the
  // names. Empty `in()` would match every row, so guard explicitly.
  const scoresBySession = new Map<string, ScoreRow[]>();
  const participantCounts = new Map<string, number>();
  if (sessionIds.length > 0) {
    const [
      { data: scoreData, error: scoreError },
      { data: participants, error: participantsError },
    ] = await Promise.all([
      supabase
        .from("participant_scores")
        .select(
          "session_id, participant_id, total_score, session_participants(first_name, last_name)",
        )
        .in("session_id", sessionIds),
      supabase
        .from("session_participants")
        .select("session_id")
        .in("session_id", sessionIds),
    ]);
    if (participantsError)
      return privateNoStoreJson<ResultsListErrorBody>(
        { error: "READ_FAILED", message: "Failed to load participants." },
        { status: 500 },
      );
    for (const participant of participants ?? [])
      participantCounts.set(
        participant.session_id,
        (participantCounts.get(participant.session_id) ?? 0) + 1,
      );

    if (scoreError) {
      return privateNoStoreJson<ResultsListErrorBody>(
        { error: "READ_FAILED", message: "Failed to load participant scores." },
        { status: 500 },
      );
    }

    const scoreRows = (scoreData ?? []) as unknown as ScoreRow[];
    for (const row of scoreRows) {
      const list = scoresBySession.get(row.session_id) ?? [];
      list.push(row);
      scoresBySession.set(row.session_id, list);
    }
  }

  const sessions: ResultsListRow[] = rows.map((row) => {
    const quiz = row.quizzes;
    const scores = scoresBySession.get(row.id) ?? [];
    const sorted = [...scores].sort((a, b) => b.total_score - a.total_score);
    const total = sorted.reduce((acc, s) => acc + s.total_score, 0);
    const participantCount = participantCounts.get(row.id) ?? 0;
    const averageScore =
      participantCount > 0 ? Math.round(total / participantCount) : 0;

    return {
      id: row.id,
      pin: row.pin,
      quizId: row.quiz_id,
      quizTitle: quiz?.title ?? "",
      brandId: quiz?.brand_id ?? "",
      endedAt: row.ended_at,
      status: row.status,
      gameMode: row.game_mode,
      startedAt: row.started_at,
      participantCount,
      averageScore,
      topThree: sorted.slice(0, 3).map((s) => ({
        participantId: s.participant_id,
        name: `${s.session_participants?.first_name ?? ""} ${
          s.session_participants?.last_name ?? ""
        }`.trim(),
        score: s.total_score,
      })),
    };
  });

  return privateNoStoreJson<ResultsListBody>({ sessions });
}
