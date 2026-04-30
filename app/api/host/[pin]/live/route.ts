import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { lazyExpireSyncQuestionState } from "@/src/lib/sessions/expiry";

interface HostLiveRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostLivePlayer {
  id: string;
  displayName: string;
  score: number;
  answered: boolean;
}

interface HostLiveSuccessBody {
  sessionId: string;
  status: string;
  gameMode: "sync" | "async";
  currentQuestionId: string | null;
  questionStatus: string | null;
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: string;
  answerCounts: Record<string, number>;
  responseCount: number;
  totalPlayers: number;
  players: HostLivePlayer[];
}

interface HostLiveErrorBody {
  error: never;
  message: never;
}

type HostLiveResponseBody = HostLiveSuccessBody | HostLiveErrorBody;

/**
 * Host real-time dashboard. Pre-reveal answer counts are surfaced here only
 * (ADR-0008 §4) — never on public endpoints. Players carry display_name
 * (`first_name + last_initial.`) but never phone or full last name.
 */
export async function GET(
  _request: NextRequest,
  context: HostLiveRouteContext,
) {
  const { pin } = await context.params;
  const ctx = await loadHostContext(pin, { includeEnded: true });
  if (!ctx.ok) return ctx.response;
  const { session, serviceSupabase } = ctx;

  // Touch host_last_seen_at so the session-expiry cron knows the host is
  // online (ADR-0004 §4.1).
  await serviceSupabase
    .from("sessions")
    .update({ host_last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  let questionStatus: string | null = null;
  let startedAt: string | null = null;
  let deadlineAt: string | null = null;
  const answerCounts: Record<string, number> = {};

  if (session.current_question_id) {
    const { row } = await lazyExpireSyncQuestionState(
      serviceSupabase,
      session.id,
      session.current_question_id,
      { autoReveal: session.auto_reveal },
    );
    questionStatus = row?.status ?? null;
    startedAt = row?.started_at ?? null;
    deadlineAt = row?.deadline_at ?? null;

    // Aggregate option distribution for the live current question.
    const { data: answerRows } = await serviceSupabase
      .from("answers")
      .select("selected_ids")
      .eq("session_id", session.id)
      .eq("question_id", session.current_question_id);

    if (answerRows) {
      for (const row of answerRows) {
        for (const optionId of row.selected_ids ?? []) {
          answerCounts[optionId] = (answerCounts[optionId] ?? 0) + 1;
        }
      }
    }
  }

  const { data: participants } = await serviceSupabase
    .from("session_participants")
    .select("id, display_name")
    .eq("session_id", session.id);

  const { data: scores } = await serviceSupabase
    .from("participant_scores")
    .select("participant_id, total_score")
    .eq("session_id", session.id);

  let answeredIds = new Set<string>();
  if (session.current_question_id) {
    const { data: answeredRows } = await serviceSupabase
      .from("answers")
      .select("participant_id")
      .eq("session_id", session.id)
      .eq("question_id", session.current_question_id);
    answeredIds = new Set(answeredRows?.map((row) => row.participant_id) ?? []);
  }

  const scoreById = new Map(
    (scores ?? []).map((row) => [row.participant_id, row.total_score]),
  );

  const players: HostLivePlayer[] = (participants ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    score: scoreById.get(row.id) ?? 0,
    answered: answeredIds.has(row.id),
  }));

  return privateNoStoreJson<HostLiveResponseBody>({
    sessionId: session.id,
    status: session.status,
    gameMode: session.game_mode,
    currentQuestionId: session.current_question_id,
    questionStatus,
    startedAt,
    deadlineAt,
    serverNow: new Date().toISOString(),
    answerCounts,
    responseCount: answeredIds.size,
    totalPlayers: participants?.length ?? 0,
    players,
  } as HostLiveSuccessBody);
}
