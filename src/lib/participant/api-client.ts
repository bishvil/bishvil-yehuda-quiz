/**
 * Typed fetchers for the participant-facing API endpoints. All requests rely
 * on the @supabase/ssr cookie set during join — no Authorization header is
 * passed manually. The participant token also rides along on the websocket
 * via the supabase browser client (see realtime hook).
 */
import type {
  ParticipantStateResponse,
} from "@/src/lib/sessions/participant-payload";

export interface QuizInfoResponse {
  pin: string;
  status: "scheduled" | "live" | "paused" | "ended" | "draft";
  gameMode: "sync" | "async";
  quizTitle: string;
  brandId: string;
  customLogo: string | null;
  customLogoLabel: string | null;
  questionCount: number;
}

export interface JoinRequestBody {
  firstName: string;
  lastName: string;
  phone: string;
  unit?: string;
  team?: string;
}

export interface JoinSuccessResponse {
  participantId: string;
  sessionId: string;
  accessToken: string;
  tokenType: "bearer";
}

export interface JoinErrorResponse {
  error: string;
  message: string;
}

export type JoinResponse = JoinSuccessResponse | JoinErrorResponse;

export interface SubmitChoiceAnswerBody {
  questionId: string;
  selectedIds: string[];
}

export type SubmitMapAnswerBody =
  | { questionId: string; pin: { x: number; y: number } }
  | { questionId: string; pin: { lat: number; lng: number } };

export type SubmitAnswerBody = SubmitChoiceAnswerBody | SubmitMapAnswerBody;

export interface SubmitAnswerSuccessResponse {
  status: "submitted" | "already_submitted";
  submittedAt: string;
  isCorrect?: boolean;
  score?: number;
  timeBonus?: number;
  correctIds?: string[] | null;
  explanation?: string | null;
}

export interface SubmitAnswerErrorResponse {
  error: string;
  message: string;
  deadlineAt?: string;
  submittedAt?: string;
}

export type SubmitAnswerResponse =
  | SubmitAnswerSuccessResponse
  | SubmitAnswerErrorResponse;

export interface AdvanceResponse {
  status?: "advanced" | "completed";
  questionId?: string;
  questionIndex?: number;
  error?: string;
  message?: string;
}

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

export async function fetchQuizInfo(pin: string): Promise<QuizInfoResponse | null> {
  const response = await fetch(`/api/quiz/${encodeURIComponent(pin)}/info`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as QuizInfoResponse;
}

export async function joinSession(
  pin: string,
  body: JoinRequestBody,
): Promise<JoinResponse> {
  const response = await fetch(`/api/session/${encodeURIComponent(pin)}/join`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    credentials: "include",
  });
  return (await response.json()) as JoinResponse;
}

export async function fetchParticipantState(
  pin: string,
): Promise<ParticipantStateResponse | null> {
  const response = await fetch(
    `/api/participant/${encodeURIComponent(pin)}/state`,
    { cache: "no-store", credentials: "include" },
  );
  if (!response.ok) return null;
  return (await response.json()) as ParticipantStateResponse;
}

export async function submitAnswer(
  pin: string,
  body: SubmitAnswerBody,
): Promise<SubmitAnswerResponse> {
  const response = await fetch(
    `/api/session/${encodeURIComponent(pin)}/answer`,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      credentials: "include",
    },
  );
  return (await response.json()) as SubmitAnswerResponse;
}

export async function advanceParticipant(pin: string): Promise<AdvanceResponse> {
  const response = await fetch(
    `/api/participant/${encodeURIComponent(pin)}/next`,
    { method: "POST", credentials: "include" },
  );
  return (await response.json()) as AdvanceResponse;
}

export type { ParticipantStateResponse };
