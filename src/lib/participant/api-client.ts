/**
 * Typed fetchers for the participant-facing API endpoints. All requests rely
 * on the @supabase/ssr cookie set during join — no Authorization header is
 * passed manually. The participant token also rides along on the websocket
 * via the supabase browser client (see realtime hook).
 */
import type { ParticipantStateResponse } from "@/src/lib/sessions/participant-payload";

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
  phone: string;
  unit?: string;
  team?: string;
  identityProvider: "google";
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
  answerSeconds?: number | null;
  isCorrect?: boolean;
  score?: number;
  timeBonus?: number;
  correctIds?: string[] | null;
  explanation?: string | null;
  /** Haversine distance in km — geo map answers only (async reveal). */
  distanceKm?: number | null;
  /** 0..1 correctness ratio — geo map + multi-select (async reveal). */
  correctnessRatio?: number | null;
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

export async function fetchQuizInfo(
  pin: string,
): Promise<QuizInfoResponse | null> {
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

export type FetchParticipantStateResult =
  | { kind: "ok"; state: ParticipantStateResponse }
  | { kind: "not_found" }
  | { kind: "error"; status: number; message: string };

export async function fetchParticipantState(
  pin: string,
): Promise<FetchParticipantStateResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/participant/${encodeURIComponent(pin)}/state`,
      { cache: "no-store", credentials: "include" },
    );
  } catch (caught) {
    return {
      kind: "error",
      status: 0,
      message: caught instanceof Error ? caught.message : "Network error",
    };
  }
  if (response.status === 404 || response.status === 401) {
    return { kind: "not_found" };
  }
  if (!response.ok) {
    return {
      kind: "error",
      status: response.status,
      message: `Request failed (${response.status})`,
    };
  }
  return {
    kind: "ok",
    state: (await response.json()) as ParticipantStateResponse,
  };
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

export async function advanceParticipant(
  pin: string,
): Promise<AdvanceResponse> {
  const response = await fetch(
    `/api/participant/${encodeURIComponent(pin)}/next`,
    { method: "POST", credentials: "include" },
  );
  return (await response.json()) as AdvanceResponse;
}

export type { ParticipantStateResponse };
