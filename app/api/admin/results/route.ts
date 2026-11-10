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
  createdAt?: string;
  lastPlayedAt?: string | null;
  lastJoinedAt?: string | null;
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
  nextOffset: number | null;
}

interface ResultsListErrorBody {
  error: "READ_FAILED" | "INVALID_REQUEST";
  message: string;
}

/**
 * Cross-quiz results for ended sessions and non-draft async sessions, with stats for
 * the `/admin/results` page. The detailed per-session drill-down still
 * lives at `/admin/quizzes/[quizId]/sessions/[sessionId]/results`.
 */
export async function GET(request: Request) {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  const offsetValue = new URL(request.url).searchParams.get("offset") ?? "0";
  const offset = Number(offsetValue);
  const pageSize = 50;
  if (
    !/^\d+$/.test(offsetValue) ||
    !Number.isSafeInteger(offset) ||
    offset > Number.MAX_SAFE_INTEGER - pageSize
  ) {
    return privateNoStoreJson<ResultsListErrorBody>(
      {
        error: "INVALID_REQUEST",
        message: "Page offset must be a non-negative integer.",
      },
      { status: 400 },
    );
  }

  interface EndedSessionRow {
    id: string;
    pin: string;
    quiz_id: string;
    ended_at: string | null;
    status: string;
    game_mode: string;
    started_at: string | null;
    created_at: string;
    quizzes: { title: string; brand_id: string } | null;
    answers: { submitted_at: string }[];
    participant_question_progress: { started_at: string | null }[];
    session_participants: { joined_at: string }[];
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
      "id, pin, quiz_id, status, game_mode, ended_at, started_at, created_at, quizzes(title, brand_id), answers!answers_session_id_sessions_id_fk(submitted_at), participant_question_progress!participant_question_progress_session_id_sessions_id_fk(started_at), session_participants!session_participants_session_id_sessions_id_fk(joined_at)",
    )
    // Legacy async games accepted answers while still globally scheduled.
    // Preserve their stored status and expose their history without rewriting it.
    .or(
      "status.eq.ended,and(game_mode.eq.async,status.in.(scheduled,live,paused))",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    // Limit embedded rows per parent: one request, independent latest dates
    // for every session, without downloading complete answer/progress history.
    .order("submitted_at", { referencedTable: "answers", ascending: false })
    .limit(1, { referencedTable: "answers" })
    .order("started_at", {
      referencedTable: "participant_question_progress",
      ascending: false,
      nullsFirst: false,
    })
    .limit(1, { referencedTable: "participant_question_progress" })
    .order("joined_at", {
      referencedTable: "session_participants",
      ascending: false,
    })
    .limit(1, { referencedTable: "session_participants" })
    .range(offset, offset + pageSize);

  if (sessionError) {
    return privateNoStoreJson<ResultsListErrorBody>(
      { error: "READ_FAILED", message: "Failed to list ended sessions." },
      { status: 500 },
    );
  }

  const fetched = (sessionData ?? []) as unknown as EndedSessionRow[];
  const nextOffset = fetched.length > pageSize ? offset + pageSize : null;
  const rows = fetched.slice(0, pageSize);
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
    const answeredAt = row.answers[0]?.submitted_at ?? null;
    const openedAt = row.participant_question_progress[0]?.started_at ?? null;
    const lastPlayedAt =
      answeredAt && openedAt
        ? Date.parse(answeredAt) >= Date.parse(openedAt)
          ? answeredAt
          : openedAt
        : (answeredAt ?? openedAt);

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
      createdAt: row.created_at,
      lastPlayedAt,
      lastJoinedAt: row.session_participants[0]?.joined_at ?? null,
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

  return privateNoStoreJson<ResultsListBody>({ sessions, nextOffset });
}
