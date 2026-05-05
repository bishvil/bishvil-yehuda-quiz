import type { HostLiveSuccessBody } from "@/app/api/host/[pin]/live/route";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

const FETCH_INIT: RequestInit = {
  cache: "no-store",
  credentials: "include",
};

export type HostLiveResponse = HostLiveSuccessBody;

export interface HostStartSessionResponse {
  sessionId: string;
  status: "live";
  startedAt: string;
}

export interface HostPauseResponse {
  sessionId: string;
  status: "paused";
}

export interface HostResumeResponse {
  sessionId: string;
  status: "live";
}

export interface HostEndResponse {
  sessionId: string;
  status: "ended";
  endedAt: string;
}

export interface HostQuestionStartResponse {
  sessionId: string;
  questionId: string;
  questionIndex: number;
  status: "answering" | "presenting";
  startedAt: string;
  deadlineAt: string | null;
}

export interface HostBeginAnsweringResponse {
  sessionId: string;
  questionId: string;
  questionIndex: number;
  status: "answering";
  startedAt: string;
  deadlineAt: string;
}

export interface HostRevealResponse {
  sessionId: string;
  questionId: string;
  status: "revealed";
  revealedAt: string;
}

export interface HostNextResponse {
  sessionId: string;
  nextQuestionId: string | null;
  nextQuestionIndex: number | null;
  status: "advanced" | "all_revealed";
}

export interface HostApiErrorBody {
  error: string;
  message: string;
}

export type HostApiResult<T> = T | HostApiErrorBody;

function isError<T>(body: HostApiResult<T>): body is HostApiErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as HostApiErrorBody).error === "string"
  );
}

async function postHostJson<T>(
  path: string,
  body?: unknown,
): Promise<HostApiResult<T>> {
  const init: RequestInit = body
    ? { ...FETCH_INIT, method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) }
    : { ...FETCH_INIT, method: "POST" };
  const response = await fetch(path, init);
  return (await response.json()) as HostApiResult<T>;
}

export async function fetchHostLive(pin: string): Promise<HostLiveResponse | null> {
  const response = await fetch(
    `/api/host/${encodeURIComponent(pin)}/live`,
    FETCH_INIT,
  );
  if (!response.ok) return null;
  return (await response.json()) as HostLiveResponse;
}

export function startHostSession(pin: string) {
  return postHostJson<HostStartSessionResponse>(
    `/api/host/${encodeURIComponent(pin)}/start`,
  );
}

export function pauseHostSession(pin: string) {
  return postHostJson<HostPauseResponse>(
    `/api/host/${encodeURIComponent(pin)}/pause`,
  );
}

export function resumeHostSession(pin: string) {
  return postHostJson<HostResumeResponse>(
    `/api/host/${encodeURIComponent(pin)}/resume`,
  );
}

export function endHostSession(pin: string) {
  return postHostJson<HostEndResponse>(
    `/api/host/${encodeURIComponent(pin)}/end`,
  );
}

export function startHostQuestion(pin: string, questionId: string) {
  return postHostJson<HostQuestionStartResponse>(
    `/api/host/${encodeURIComponent(pin)}/question/start`,
    { questionId },
  );
}

export function revealHostQuestion(pin: string, questionId: string) {
  return postHostJson<HostRevealResponse>(
    `/api/host/${encodeURIComponent(pin)}/question/reveal`,
    { questionId },
  );
}

export function nextHostQuestion(pin: string) {
  return postHostJson<HostNextResponse>(`/api/host/${encodeURIComponent(pin)}/question/next`);
}

export function beginAnsweringHostQuestion(pin: string, questionId: string) {
  return postHostJson<HostBeginAnsweringResponse>(`/api/host/${encodeURIComponent(pin)}/question/begin-answering`, { questionId });
}
export const isHostApiError = isError;
