import type {
  Database,
  GameModeEnum,
  QuestionTypeEnum,
  SessionStatusEnum,
  AsyncQuestionStatusEnum,
  QuestionStatusEnum,
} from "@/src/lib/supabase/database.types";
import {
  parseStoredQuestionMap,
  validateStoredQuestionContent,
} from "@/src/lib/schemas/question-content";

export interface ParticipantSessionPayload {
  status: SessionStatusEnum;
  gameMode: GameModeEnum;
  quizTitle: string;
  brandId: string;
  customLogo: string | null;
}

export interface ParticipantQuestionPayload {
  /** Question UUID — load-bearing for the answer submit body. Per
   *  ADR-0008 §2, this UUID is not on the forbidden list (correct_ids
   *  and explanation are). */
  id: string;
  index: number;
  total: number;
  type: QuestionTypeEnum;
  prompt: string;
  options: Array<{ id: string; text: string; image_url?: string }> | null;
  imageUrl: string | null;
  /**
   * Map metadata — only the public-safe slice. The correct target lives
   * in the reveal payload (ADR-0008 §2). For map questions the `geo`
   * key is set with `center`, `zoom`, `toleranceKm`, and `styleHint` only —
   * the `target` is intentionally absent.
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
  /** Total possible points for this question. Used for "X/Y נקודות" display. */
  points: number;
  status: QuestionStatusEnum | AsyncQuestionStatusEnum;
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: string;
}

export type ParticipantAnswerStatus =
  | "submitted_awaiting_reveal"
  | "revealed";

export interface ParticipantAnswerPayload {
  submittedAt: string;
  status: ParticipantAnswerStatus;
  /**
   * The participant's submitted choice ids (single / truefalse / image /
   * multi). Surfaced so the reveal screen can render
   * "X מתוך W סימונים נכונים" for multi-select after a remount, when the
   * client-side selection state has been cleared.
   */
  selectedIds?: string[] | null;
  isCorrect?: boolean;
  score?: number;
  timeBonus?: number;
  /**
   * Haversine distance in km — set only for geo map answers on reveal.
   * Enables "X ק״מ מהיעד" display in the participant reveal screen.
   */
  distanceKm?: number | null;
  /**
   * 0..1 correctness ratio — set for geo map and multi-select answers on
   * reveal. Null for single / truefalse / image.
   */
  correctnessRatio?: number | null;
}

export interface ParticipantQuestionRevealPayload {
  correctIds: string[] | null;
  explanation: string | null;
  /**
   * Correct geographic target for map questions — only set on reveal
   * (ADR-0008 §2 parity with `correct_ids`: the target is the answer).
   * Null for non-map questions.
   */
  mapGeoTarget: { lat: number; lng: number } | null;
}

export interface ParticipantStateResponse {
  session: ParticipantSessionPayload;
  question: ParticipantQuestionPayload | null;
  myAnswer: ParticipantAnswerPayload | null;
  myScore: number;
  reveal: ParticipantQuestionRevealPayload | null;
}

export function extractMapGeoTarget(
  map: QuestionRow["map"] | null,
): { lat: number; lng: number } | null {
  const parsed = parseStoredQuestionMap(map);
  if (!parsed.success || !parsed.data) return null;
  return parsed.data.geo.target;
}

type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];

export function buildParticipantQuestionPayload(args: {
  ordinal: number;
  totalQuestions: number;
  question: Pick<
    QuestionRow,
    | "id"
    | "type"
    | "prompt"
    | "options"
    | "map"
    | "image_url"
    | "time_seconds"
    | "points"
  >;
  status: QuestionStatusEnum | AsyncQuestionStatusEnum;
  startedAt: string | null;
  deadlineAt: string | null;
  serverNow: Date;
}): ParticipantQuestionPayload | null {
  const parsedContent = validateStoredQuestionContent({
    type: args.question.type,
    options: args.question.options,
    map: args.question.map,
  });

  if (!parsedContent.success) {
    return null;
  }

  const optionsArray = parsedContent.data.options?.map((option) => ({
    id: option.id,
    text: option.text,
    image_url: option.image_url,
  })) ?? null;

  const mapPayload = (() => {
    const parsedMap = parsedContent.data.map;
    if (!parsedMap) return null;
    // Strip `target` per ADR-0008 §2 — it lives in the reveal payload.
    return {
      geo: {
        center: parsedMap.geo.center,
        zoom: parsedMap.geo.zoom,
        toleranceKm: parsedMap.geo.toleranceKm,
        styleHint: parsedMap.geo.styleHint,
      },
    } as const;
  })();

  return {
    id: args.question.id,
    index: args.ordinal,
    total: args.totalQuestions,
    type: args.question.type,
    prompt: args.question.prompt,
    options: optionsArray,
    imageUrl: args.question.image_url,
    map: mapPayload,
    timeSeconds: args.question.time_seconds,
    points: args.question.points,
    status: args.status,
    startedAt: args.startedAt,
    deadlineAt: args.deadlineAt,
    serverNow: args.serverNow.toISOString(),
  };
}

export function buildParticipantAnswerPayload(
  answer: AnswerRow,
  isRevealed: boolean,
): ParticipantAnswerPayload {
  if (!isRevealed) {
    return {
      submittedAt: answer.submitted_at,
      status: "submitted_awaiting_reveal",
      selectedIds: answer.selected_ids,
    };
  }

  return {
    submittedAt: answer.submitted_at,
    status: "revealed",
    selectedIds: answer.selected_ids,
    isCorrect: answer.is_correct,
    score: answer.score,
    timeBonus: answer.time_bonus,
    distanceKm: answer.distance_km != null ? Number(answer.distance_km) : null,
    correctnessRatio:
      answer.correctness_ratio != null ? Number(answer.correctness_ratio) : null,
  };
}
