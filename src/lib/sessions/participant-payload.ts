import type {
  Database,
  GameModeEnum,
  QuestionTypeEnum,
  SessionStatusEnum,
  AsyncQuestionStatusEnum,
  QuestionStatusEnum,
} from "@/src/lib/supabase/database.types";

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
  /** Map images are public; the correct target lives in the reveal payload. */
  map: { image_url: string } | null;
  timeSeconds: number;
  /** Map question tolerance (% radius) for client-side reveal-ring sizing. */
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
  /** Correct target for map questions — only set on reveal. ADR-0008 §2
   *  parity with correct_ids: the target is the correct answer. */
  mapTarget: { x: number; y: number } | null;
}

export interface ParticipantStateResponse {
  session: ParticipantSessionPayload;
  question: ParticipantQuestionPayload | null;
  myAnswer: ParticipantAnswerPayload | null;
  myScore: number;
  reveal: ParticipantQuestionRevealPayload | null;
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

export function extractMapTarget(
  map: QuestionRow["map"] | null,
): { x: number; y: number } | null {
  if (!map || typeof map !== "object") return null;
  const raw = map as unknown as RawQuestionMap;
  if (!raw.target) return null;
  if (typeof raw.target.x !== "number" || typeof raw.target.y !== "number") {
    return null;
  }
  return { x: raw.target.x, y: raw.target.y };
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
}): ParticipantQuestionPayload {
  const optionsArray = Array.isArray(args.question.options)
    ? (args.question.options as unknown as RawQuestionOption[]).map((option) => ({
        id: option.id,
        text: option.text,
        image_url: option.image_url,
      }))
    : null;

  const mapPayload =
    args.question.map && typeof args.question.map === "object"
      ? (() => {
          const raw = args.question.map as unknown as RawQuestionMap;
          return { image_url: raw.image_url };
        })()
      : null;

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
