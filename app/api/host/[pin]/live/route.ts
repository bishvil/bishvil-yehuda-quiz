import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { lazyExpireSyncQuestionState } from "@/src/lib/sessions/expiry";
import type {
  QuestionTypeEnum,
  QuestionStatusEnum,
} from "@/src/lib/supabase/database.types";

interface HostLiveRouteContext {
  params: Promise<{ pin: string }>;
}

interface HostLivePlayer {
  id: string;
  displayName: string;
  score: number;
  answered: boolean;
}

export interface HostLiveQuestion {
  id: string;
  ordinal: number;
  type: QuestionTypeEnum;
  prompt: string;
  /** Options carry only id + text + optional image — never `correct_ids`. */
  options: Array<{ id: string; text: string; image_url?: string }> | null;
  imageUrl: string | null;
  /** Map carries only the background image — `target` is reveal-gated below. */
  map: { image_url: string } | null;
  timeSeconds: number;
  tolerance: number | null;
  status: QuestionStatusEnum;
  startedAt: string | null;
  deadlineAt: string | null;
}

export interface HostLiveReveal {
  correctIds: string[] | null;
  mapTarget: { x: number; y: number } | null;
  explanation: string | null;
}

export interface HostLiveSuccessBody {
  sessionId: string;
  status: string;
  gameMode: "sync" | "async";
  serverNow: string;
  totalQuestions: number;
  /** The question the host should start next (or first), if no live question. */
  nextQuestion: { id: string; ordinal: number } | null;
  /** Currently-active question for this session (idle / answering / locked / revealed). */
  question: HostLiveQuestion | null;
  /** Aggregate distribution for the live current question — host-only per ADR-0008 §4. */
  answerCounts: Record<string, number>;
  /** Number of distinct participants who answered the current question. */
  responseCount: number;
  totalPlayers: number;
  /** Reveal data — only populated when question.status === "revealed". */
  reveal: HostLiveReveal | null;
  players: HostLivePlayer[];
}

interface RawQuestionOption {
  id: string;
  text: string;
  image_url?: string;
}

interface RawQuestionMap {
  image_url: string;
  target?: { x: number; y: number };
}

/**
 * Host real-time dashboard. Pre-reveal answer counts are surfaced here only
 * (ADR-0008 §4) — never on public endpoints. The response also embeds the
 * current question content (mirroring the participant /state shape) so the
 * dashboard can render bars + prompt without a second fetch. Per ADR-0008 §2,
 * `correct_ids` and `map.target` are stripped from the question payload and
 * only ship inside `reveal` when the question state is `revealed`.
 *
 * Response is always `Cache-Control: private, no-store` (ADR-0008 §3).
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

  let questionPayload: HostLiveQuestion | null = null;
  let revealPayload: HostLiveReveal | null = null;
  const answerCounts: Record<string, number> = {};
  let answeredIds = new Set<string>();

  if (session.current_question_id) {
    const { row } = await lazyExpireSyncQuestionState(
      serviceSupabase,
      session.id,
      session.current_question_id,
      { autoReveal: session.auto_reveal },
    );

    const { data: question } = await serviceSupabase
      .from("questions")
      .select(
        "id, ordinal, type, prompt, options, map, image_url, time_seconds, tolerance, correct_ids, explanation",
      )
      .eq("id", session.current_question_id)
      .maybeSingle();

    if (question) {
      const optionsArray = Array.isArray(question.options)
        ? (question.options as unknown as RawQuestionOption[]).map((option) => ({
            id: option.id,
            text: option.text,
            image_url: option.image_url,
          }))
        : null;

      const rawMap =
        question.map && typeof question.map === "object"
          ? (question.map as unknown as RawQuestionMap)
          : null;

      const toleranceValue = question.tolerance
        ? Number.parseFloat(question.tolerance)
        : null;

      questionPayload = {
        id: question.id,
        ordinal: question.ordinal,
        type: question.type,
        prompt: question.prompt,
        options: optionsArray,
        imageUrl: question.image_url,
        // Always strip target — it lives inside reveal only.
        map: rawMap ? { image_url: rawMap.image_url } : null,
        timeSeconds: question.time_seconds,
        tolerance:
          toleranceValue !== null && Number.isFinite(toleranceValue)
            ? toleranceValue
            : null,
        status: (row?.status ?? "idle") as QuestionStatusEnum,
        startedAt: row?.started_at ?? null,
        deadlineAt: row?.deadline_at ?? null,
      };

      if (questionPayload.status === "revealed") {
        revealPayload = {
          correctIds: question.correct_ids ?? null,
          mapTarget:
            rawMap?.target &&
            typeof rawMap.target.x === "number" &&
            typeof rawMap.target.y === "number"
              ? { x: rawMap.target.x, y: rawMap.target.y }
              : null,
          explanation: question.explanation,
        };
      }
    }

    // Aggregate option distribution + per-participant answered-set for the
    // currently-live question.
    const { data: answerRows } = await serviceSupabase
      .from("answers")
      .select("selected_ids, participant_id")
      .eq("session_id", session.id)
      .eq("question_id", session.current_question_id);

    if (answerRows) {
      for (const row of answerRows) {
        for (const optionId of row.selected_ids ?? []) {
          answerCounts[optionId] = (answerCounts[optionId] ?? 0) + 1;
        }
      }
      answeredIds = new Set(answerRows.map((row) => row.participant_id));
    }
  }

  // Total questions on the quiz — used for "station N of M" counters.
  const { count: totalQuestions } = await serviceSupabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", session.quiz_id);

  // Compute the next question to start: lowest ordinal beyond the current
  // question (or the first question if no current question yet). When the
  // current question is `revealed`, this is what the "next station" CTA
  // calls /question/start with after /question/next advances.
  let nextQuestion: HostLiveSuccessBody["nextQuestion"] = null;
  const currentOrdinal = questionPayload?.ordinal ?? 0;
  const includeCurrent = !session.current_question_id;
  const { data: nextRow } = await serviceSupabase
    .from("questions")
    .select("id, ordinal")
    .eq("quiz_id", session.quiz_id)
    .gte("ordinal", includeCurrent ? 1 : currentOrdinal + 1)
    .order("ordinal", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextRow) {
    nextQuestion = { id: nextRow.id, ordinal: nextRow.ordinal };
  }

  const { data: participants } = await serviceSupabase
    .from("session_participants")
    .select("id, display_name")
    .eq("session_id", session.id);

  const { data: scores } = await serviceSupabase
    .from("participant_scores")
    .select("participant_id, total_score")
    .eq("session_id", session.id);

  const scoreById = new Map(
    (scores ?? []).map((row) => [row.participant_id, row.total_score]),
  );

  const players: HostLivePlayer[] = (participants ?? [])
    .map((row) => ({
      id: row.id,
      displayName: row.display_name,
      score: scoreById.get(row.id) ?? 0,
      answered: answeredIds.has(row.id),
    }))
    // Stable sort: highest score first, then by display name for determinism.
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName, "he"));

  return privateNoStoreJson<HostLiveSuccessBody>({
    sessionId: session.id,
    status: session.status,
    gameMode: session.game_mode,
    serverNow: new Date().toISOString(),
    totalQuestions: totalQuestions ?? 0,
    nextQuestion,
    question: questionPayload,
    answerCounts,
    responseCount: answeredIds.size,
    totalPlayers: participants?.length ?? 0,
    reveal: revealPayload,
    players,
  });
}
