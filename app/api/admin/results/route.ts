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
 * QA-23: cross-quiz list of ENDED sessions with quick summary stats for
 * the `/admin/results` page. The detailed per-session drill-down still
 * lives at `/admin/quizzes/[quizId]/sessions/[sessionId]/results`.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (!auth.ok) return auth.response;

  type ParticipantRow = {
    id: string;
    first_name: string;
    last_name: string;
    total_score: number;
  };

  interface EndedSessionRow {
    id: string;
    pin: string;
    quiz_id: string;
    ended_at: string | null;
    started_at: string | null;
    quizzes: { title: string; brand_id: string } | null;
    participants: ParticipantRow[] | null;
  }

  const supabase = await createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      `id, pin, quiz_id, ended_at, started_at,
       quizzes(title, brand_id),
       participants(id, first_name, last_name, total_score)`,
    )
    .eq("status", "ended")
    .order("ended_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    return privateNoStoreJson<ResultsListErrorBody>(
      { error: "READ_FAILED", message: "Failed to list ended sessions." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as EndedSessionRow[];

  const sessions: ResultsListRow[] = rows.map((row) => {
    const quiz = row.quizzes;
    const participants = row.participants ?? [];
    const sorted = [...participants].sort(
      (a, b) => b.total_score - a.total_score,
    );
    const total = sorted.reduce((acc, p) => acc + p.total_score, 0);
    const averageScore =
      sorted.length > 0 ? Math.round(total / sorted.length) : 0;

    return {
      id: row.id,
      pin: row.pin,
      quizId: row.quiz_id,
      quizTitle: quiz?.title ?? "",
      brandId: quiz?.brand_id ?? "",
      endedAt: row.ended_at,
      startedAt: row.started_at,
      participantCount: sorted.length,
      averageScore,
      topThree: sorted.slice(0, 3).map((p) => ({
        participantId: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        score: p.total_score,
      })),
    };
  });

  return privateNoStoreJson<ResultsListBody>({ sessions });
}
