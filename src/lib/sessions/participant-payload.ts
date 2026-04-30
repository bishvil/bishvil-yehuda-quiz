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
  index: number;
  total: number;
  type: QuestionTypeEnum;
  prompt: string;
  options: Array<{ id: string; text: string; image_url?: string }> | null;
  imageUrl: string | null;
  map: { image_url: string } | null;
  timeSeconds: number;
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
}

type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type AnswerRow = Database["public"]["Tables"]["answers"]["Row"];

export function buildParticipantQuestionPayload(args: {
  ordinal: number;
  totalQuestions: number;
  question: Pick<
    QuestionRow,
    "type" | "prompt" | "options" | "map" | "image_url" | "time_seconds"
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
      ? {
          image_url: (args.question.map as unknown as RawQuestionMap).image_url,
        }
      : null;

  return {
    index: args.ordinal,
    total: args.totalQuestions,
    type: args.question.type,
    prompt: args.question.prompt,
    options: optionsArray,
    imageUrl: args.question.image_url,
    map: mapPayload,
    timeSeconds: args.question.time_seconds,
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
