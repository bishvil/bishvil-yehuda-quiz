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
   * in the reveal payload (ADR-0008 §2). For legacy raster questions the
   * `image_url` key is set; for geographic questions the `geo` key is
   * set with `center`, `zoom`, `toleranceKm`, and `styleHint` only — the
   * `target` is intentionally absent.
   */
  map:
    | { image_url: string; geo?: never }
    | {
        image_url?: never;
        geo: {
          center?: { lat: number; lng: number };
          zoom?: number;
          toleranceKm: number;
          styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
        };
      }
    | null;
  timeSeconds: number;
  /** Legacy map question tolerance (% radius) for raster reveal-ring sizing. */
  tolerance: number | null;
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
  isCorrect?: boolean;
  score?: number;
  timeBonus?: number;
}

export interface ParticipantQuestionRevealPayload {
  correctIds: string[] | null;
  explanation: string | null;
  /**
   * Correct target for map questions — only set on reveal (ADR-0008 §2
   * parity with `correct_ids`: the target is the correct answer).
   *
   * `mapTarget` is the legacy `{x,y}` percent-of-image target (raster
   * questions). `mapGeoTarget` is the additive `{lat,lng}` geographic
   * target (ADR-0011). Exactly one of the two is set per revealed
   * question; both are null for non-map questions.
   */
  mapTarget: { x: number; y: number } | null;
  mapGeoTarget: { lat: number; lng: number } | null;
}

export interface ParticipantStateResponse {
  session: ParticipantSessionPayload;
  question: ParticipantQuestionPayload | null;
  myAnswer: ParticipantAnswerPayload | null;
  myScore: number;
  reveal: ParticipantQuestionRevealPayload | null;
}

export function extractMapTarget(
  map: QuestionRow["map"] | null,
): { x: number; y: number } | null {
  const parsed = parseStoredQuestionMap(map);
  if (!parsed.success || !parsed.data) return null;
  return parsed.data.target ?? null;
}

export function extractMapGeoTarget(
  map: QuestionRow["map"] | null,
): { lat: number; lng: number } | null {
  const parsed = parseStoredQuestionMap(map);
  if (!parsed.success || !parsed.data || !parsed.data.geo) return null;
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
    | "tolerance"
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
    if (parsedMap.geo) {
      // Strip `target` per ADR-0008 §2 — it lives in the reveal payload.
      return {
        geo: {
          center: parsedMap.geo.center,
          zoom: parsedMap.geo.zoom,
          toleranceKm: parsedMap.geo.toleranceKm,
          styleHint: parsedMap.geo.styleHint,
        },
      } as const;
    }
    if (parsedMap.image_url) {
      return { image_url: parsedMap.image_url } as const;
    }
    return null;
  })();

  const toleranceValue = args.question.tolerance
    ? Number.parseFloat(args.question.tolerance)
    : null;

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
    tolerance:
      toleranceValue !== null && Number.isFinite(toleranceValue) ? toleranceValue : null,
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
    };
  }

  return {
    submittedAt: answer.submitted_at,
    status: "revealed",
    isCorrect: answer.is_correct,
    score: answer.score,
    timeBonus: answer.time_bonus,
  };
}
