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
  /** Admin-supplied alt text for `imageUrl`. Null when no image. */
  imageAlt: string | null;
  /**
   * Natural pixel dimensions captured at upload time. Lets the client
   * reserve aspect ratio (no CLS) before the image loads. Null on legacy
   * rows or external URLs that bypassed the upload pipeline.
   */
  imageWidth: number | null;
  imageHeight: number | null;
  /**
   * Video media (ADR-0013). Either `videoUrl` (self-hosted MP4/WebM) OR
   * `videoEmbedUrl` (YouTube/Vimeo) — never both, enforced by a CHECK on
   * `questions`. `videoPath` is admin-private and intentionally absent.
   */
  videoUrl: string | null;
  videoEmbedUrl: string | null;
  videoProvider: "self" | "youtube" | "vimeo" | null;
  videoMimeType: string | null;
  videoDurationSeconds: number | null;
  videoPosterUrl: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  /**
   * Server-stored offset added to `deadline_at` so the answer timer doesn't
   * tick during the video gate. Client uses it only as metadata; the
   * countdown runs against `serverNow` and `deadlineAt` directly. The
   * scoring RPC caps remaining seconds at `timeSeconds`, so this offset
   * never inflates the time bonus.
   */
  mediaLeadSeconds: number;
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

export type ParticipantAnswerStatus = "submitted_awaiting_reveal" | "revealed";

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
  /**
   * The participant's submitted map pin. This is their own answer and is
   * safe before reveal; the correct target remains in the reveal payload.
   */
  pin?: { lat: number; lng: number } | null;
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

function narrowVideoProvider(
  raw: string | null,
): "self" | "youtube" | "vimeo" | null {
  // The DB CHECK constraint already restricts the column to this set, but
  // the generated `string | null` Database type doesn't carry that. Guard at
  // the boundary so the participant payload exposes a literal union.
  if (raw === "self" || raw === "youtube" || raw === "vimeo") return raw;
  return null;
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
    | "image_alt"
    | "image_width"
    | "image_height"
    | "video_url"
    | "video_embed_url"
    | "video_provider"
    | "video_mime_type"
    | "video_duration_seconds"
    | "video_poster_url"
    | "video_width"
    | "video_height"
    | "media_lead_seconds"
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

  const optionsArray =
    parsedContent.data.options?.map((option) => ({
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
    imageAlt: args.question.image_alt,
    imageWidth: args.question.image_width,
    imageHeight: args.question.image_height,
    videoUrl: args.question.video_url,
    videoEmbedUrl: args.question.video_embed_url,
    videoProvider: narrowVideoProvider(args.question.video_provider),
    videoMimeType: args.question.video_mime_type,
    videoDurationSeconds: args.question.video_duration_seconds,
    videoPosterUrl: args.question.video_poster_url,
    videoWidth: args.question.video_width,
    videoHeight: args.question.video_height,
    mediaLeadSeconds: args.question.media_lead_seconds ?? 0,
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
  const submittedPin = getSubmittedMapPin(answer);

  if (!isRevealed) {
    return {
      submittedAt: answer.submitted_at,
      status: "submitted_awaiting_reveal",
      selectedIds: answer.selected_ids,
      pin: submittedPin,
    };
  }

  return {
    submittedAt: answer.submitted_at,
    status: "revealed",
    selectedIds: answer.selected_ids,
    pin: submittedPin,
    isCorrect: answer.is_correct,
    score: answer.score,
    timeBonus: answer.time_bonus,
    distanceKm: answer.distance_km != null ? Number(answer.distance_km) : null,
    correctnessRatio:
      answer.correctness_ratio != null
        ? Number(answer.correctness_ratio)
        : null,
  };
}

function getSubmittedMapPin(
  answer: AnswerRow,
): { lat: number; lng: number } | null {
  if (answer.pin_lat == null || answer.pin_lng == null) return null;
  const lat = Number(answer.pin_lat);
  const lng = Number(answer.pin_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
