import { type NextRequest } from "next/server";

import { privateNoStoreJson } from "@/src/lib/http/responses";
import { loadHostContext } from "@/src/lib/sessions/host-context";
import { lazyExpireSyncQuestionState } from "@/src/lib/sessions/expiry";
import { haversineKm } from "@/src/lib/scoring";
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
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /**
   * Map content — geo block only. `geo.target` (lat/lng) is reveal-gated
   * and never ships here.
   */
  map: {
    geo: {
      center?: { lat: number; lng: number };
      zoom?: number;
      toleranceKm: number;
      styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
    };
  } | null;
  timeSeconds: number;
  status: QuestionStatusEnum;
  startedAt: string | null;
  deadlineAt: string | null;
}

export interface HostLiveReveal {
  correctIds: string[] | null;
  mapGeoTarget: { lat: number; lng: number } | null;
  explanation: string | null;
}

/**
 * Per-participant current-question position — async mode only (ADR-0007 §2).
 * Sourced from `participant_question_progress` (which is never written for
 * sync sessions).
 */
export interface HostLiveParticipantProgress {
  participantId: string;
  displayName: string;
  questionIndex: number;
  status: string;
}

/**
 * Participant map-pin entry for the host guide view (Part D).
 *
 * Pre-reveal: only `participantId`, `lat`, `lng` are populated.
 * `isCorrect` and `distanceKm` are withheld until `question.status === "revealed"`
 * to avoid leaking the answer per ADR-0008 §2.
 */
export interface HostLiveMapAnswer {
  participantId: string;
  lat: number;
  lng: number;
  isCorrect: boolean | null;
  distanceKm: number | null;
  /**
   * 0..1 correctness ratio from the partial-credit formula.
   * Null pre-reveal (ADR-0008 §2 answer leakage guard).
   * ADR-0006 Open Q2 RESOLVED.
   */
  correctnessRatio: number | null;
}

export interface HostLiveSuccessBody {
  sessionId: string;
  status: string;
  gameMode: "sync" | "async";
  /**
   * Whether the host may issue control mutations.
   * False for async sessions — host is a read-only monitor (ADR-0007 §2.7).
   */
  canControl: boolean;
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
  /**
   * Per-participant progress — async mode only (ADR-0007 §2.7).
   * Null for sync sessions (progress is implicit from session.current_question_id).
   */
  participantProgress: HostLiveParticipantProgress[] | null;
  /**
   * Participant map pins for the active map question — host guide view (Part D).
   * `isCorrect`/`distanceKm` are null pre-reveal to prevent answer leakage
   * (ADR-0008 §2).
   * Null when the active question is not a geo map question.
   */
  mapAnswers: HostLiveMapAnswer[] | null;
}

interface RawQuestionOption {
  id: string;
  text: string;
  image_url?: string;
}

interface RawQuestionMap {
  geo?: {
    center?: { lat: number; lng: number };
    zoom?: number;
    toleranceKm: number;
    styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
    target?: { lat: number; lng: number };
  };
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
  const { session, serviceSupabase, canControl } = ctx;

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
  let rawMapAnswers: HostLiveMapAnswer[] | null = null;

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
        "id, ordinal, type, prompt, options, map, image_url, image_alt, image_width, image_height, time_seconds, correct_ids, explanation",
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

      const mapPayload: HostLiveQuestion["map"] =
        rawMap?.geo
          ? {
              geo: {
                center: rawMap.geo.center,
                zoom: rawMap.geo.zoom,
                toleranceKm: rawMap.geo.toleranceKm,
                styleHint: rawMap.geo.styleHint,
              },
            }
          : null;

      questionPayload = {
        id: question.id,
        ordinal: question.ordinal,
        type: question.type,
        prompt: question.prompt,
        options: optionsArray,
        imageUrl: question.image_url,
        imageAlt: question.image_alt,
        imageWidth: question.image_width,
        imageHeight: question.image_height,
        // Always strip target — it lives inside reveal only.
        map: mapPayload,
        timeSeconds: question.time_seconds,
        status: (row?.status ?? "idle") as QuestionStatusEnum,
        startedAt: row?.started_at ?? null,
        deadlineAt: row?.deadline_at ?? null,
      };

      if (questionPayload.status === "revealed") {
        const geoTarget = rawMap?.geo?.target;
        revealPayload = {
          correctIds: question.correct_ids ?? null,
          mapGeoTarget:
            geoTarget &&
            typeof geoTarget.lat === "number" &&
            typeof geoTarget.lng === "number"
              ? { lat: geoTarget.lat, lng: geoTarget.lng }
              : null,
          explanation: question.explanation,
        };
      }
    }

    // Aggregate option distribution + per-participant answered-set for the
    // currently-live question. Also fetch geo pins for map-question guide view.
    const { data: answerRows } = await serviceSupabase
      .from("answers")
      .select("selected_ids, participant_id, pin_lat, pin_lng, is_correct, distance_km, correctness_ratio")
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

    // isCorrect, distanceKm and correctnessRatio are stripped pre-reveal to
    // prevent answer leakage per ADR-0008 §2.
    if (questionPayload?.type === "map" && questionPayload.map?.geo && answerRows) {
      const isRevealed = questionPayload.status === "revealed";
      const geoTarget = revealPayload?.mapGeoTarget ?? null;
      const toleranceKm = questionPayload.map.geo.toleranceKm;
      rawMapAnswers = answerRows
        .filter(
          (row): row is typeof row & { pin_lat: string; pin_lng: string } =>
            row.pin_lat != null && row.pin_lng != null,
        )
        .map((row) => {
          const lat = Number.parseFloat(row.pin_lat);
          const lng = Number.parseFloat(row.pin_lng);
          if (!isRevealed || !geoTarget) {
            return {
              participantId: row.participant_id,
              lat,
              lng,
              isCorrect: null,
              distanceKm: null,
              correctnessRatio: null,
            };
          }
          // Prefer the stored distance_km (server-authoritative) over re-computing
          // haversine here to ensure host view is consistent with the answer row.
          const storedDistKm = row.distance_km != null ? Number(row.distance_km) : null;
          const distanceKm =
            storedDistKm ?? haversineKm({ lat, lng }, geoTarget);
          const roundedDist = Math.round(distanceKm * 100) / 100;
          // Compute correctness_ratio using the same strict-boundary formula as the RPC.
          const storedRatio =
            row.correctness_ratio != null ? Number(row.correctness_ratio) : null;
          const correctnessRatio =
            storedRatio ??
            (distanceKm < toleranceKm
              ? 1 - distanceKm / toleranceKm
              : 0);
          return {
            participantId: row.participant_id,
            lat,
            lng,
            isCorrect: row.is_correct,
            distanceKm: roundedDist,
            correctnessRatio: Math.round(correctnessRatio * 1000) / 1000,
          };
        });
    }
  }

  // The next question to start: lowest ordinal beyond the current question
  // (or the first question if there is no current question yet).
  const currentOrdinal = questionPayload?.ordinal ?? 0;
  const includeCurrent = !session.current_question_id;

  const [
    totalQuestionsResult,
    nextQuestionResult,
    participantsResult,
    scoresResult,
  ] = await Promise.all([
    serviceSupabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", session.quiz_id),
    serviceSupabase
      .from("questions")
      .select("id, ordinal")
      .eq("quiz_id", session.quiz_id)
      .gte("ordinal", includeCurrent ? 1 : currentOrdinal + 1)
      .order("ordinal", { ascending: true })
      .limit(1)
      .maybeSingle(),
    serviceSupabase
      .from("session_participants")
      .select("id, display_name")
      .eq("session_id", session.id),
    serviceSupabase
      .from("participant_scores")
      .select("participant_id, total_score")
      .eq("session_id", session.id),
  ]);

  const totalQuestions = totalQuestionsResult.count;
  const nextRow = nextQuestionResult.data;
  const participants = participantsResult.data;
  const scores = scoresResult.data;

  let nextQuestion: HostLiveSuccessBody["nextQuestion"] = null;
  if (nextRow) {
    nextQuestion = { id: nextRow.id, ordinal: nextRow.ordinal };
  }

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

  // Per-participant question progress — async mode only (ADR-0007 §2.2 + §2.7).
  // Build a display-name lookup from the participants already fetched.
  let participantProgress: HostLiveParticipantProgress[] | null = null;
  if (session.game_mode === "async") {
    const displayNameById = new Map(
      (participants ?? []).map((row) => [row.id, row.display_name]),
    );
    const { data: progressRows } = await serviceSupabase
      .from("participant_question_progress")
      .select("participant_id, question_index, status")
      .eq("session_id", session.id)
      .order("question_index", { ascending: false });

    if (progressRows) {
      // Keep only the latest (highest question_index) row per participant.
      const latestByParticipant = new Map<
        string,
        { questionIndex: number; status: string }
      >();
      for (const row of progressRows) {
        if (!latestByParticipant.has(row.participant_id)) {
          latestByParticipant.set(row.participant_id, {
            questionIndex: row.question_index,
            status: row.status,
          });
        }
      }
      participantProgress = [...latestByParticipant.entries()].map(
        ([participantId, { questionIndex, status }]) => ({
          participantId,
          displayName: displayNameById.get(participantId) ?? participantId,
          questionIndex,
          status,
        }),
      );
      // Sort by furthest along, then by display name.
      participantProgress.sort(
        (a, b) =>
          b.questionIndex - a.questionIndex ||
          a.displayName.localeCompare(b.displayName, "he"),
      );
    }
  }

  return privateNoStoreJson<HostLiveSuccessBody>({
    sessionId: session.id,
    status: session.status,
    gameMode: session.game_mode,
    canControl,
    serverNow: new Date().toISOString(),
    totalQuestions: totalQuestions ?? 0,
    nextQuestion,
    question: questionPayload,
    answerCounts,
    responseCount: answeredIds.size,
    totalPlayers: participants?.length ?? 0,
    reveal: revealPayload,
    players,
    participantProgress,
    mapAnswers: rawMapAnswers,
  });
}
