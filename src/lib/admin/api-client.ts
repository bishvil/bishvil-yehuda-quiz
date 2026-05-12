/**
 * Typed fetchers for the admin-facing API endpoints. Mirrors the host client
 * pattern (`cache: "no-store"` + `credentials: "include"`) so the Supabase
 * SSR cookie set by /api/auth/admin/signin rides along on every request.
 *
 * Per ADR-0004 §"Admin Role" + ADR-0008 §5: admin payloads are private —
 * the server already replies with `Cache-Control: private, no-store`; we
 * still pass `cache: "no-store"` here so Next never serves a stale RSC.
 */
import { LOCKED_QUIZ_EDIT_HEADER } from "@/src/lib/admin/quiz-edit-override";
import type {
  AdminApiErrorBody,
  AdminApiResult,
  AdminQuestionCreateRequest,
  AdminQuestionDeleteResponse,
  AdminQuestionListResponse,
  AdminQuestionReorderRequest,
  AdminQuestionReorderResponse,
  AdminQuestionUpdateRequest,
  AdminQuestionUpsertResponse,
  AdminQuizCreateRequest,
  AdminQuizCreateResponse,
  AdminQuizDeleteResponse,
  AdminQuizDetailResponse,
  AdminQuizDuplicateResponse,
  AdminQuizHardDeleteResponse,
  AdminQuizListResponse,
  AdminQuizUnarchiveResponse,
  AdminQuizUpdateRequest,
  AdminRequestBody,
  AdminSessionArchiveResponse,
  AdminSessionCreateRequest,
  AdminSessionCreateResponse,
  AdminSessionHardDeleteResponse,
  AdminSessionListResponse,
  AdminSessionPatchHostRequest,
  AdminSessionPatchHostResponse,
  AdminSessionResultsResponse,
  AdminTeamListResponse,
  LockedQuizEditOptions,
} from "@/src/lib/admin/api-types";

export type * from "@/src/lib/admin/api-types";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

const FETCH_INIT: RequestInit = {
  cache: "no-store",
  credentials: "include",
};

export function isAdminApiError<T>(
  body: AdminApiResult<T>,
): body is AdminApiErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as AdminApiErrorBody).error === "string"
  );
}

// ---------- Internals ----------------------------------------------------

async function getJson<T>(path: string): Promise<AdminApiResult<T>> {
  const response = await fetch(path, FETCH_INIT);
  return (await response.json()) as AdminApiResult<T>;
}

async function bodyJson<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: AdminRequestBody,
  options: LockedQuizEditOptions = {},
): Promise<AdminApiResult<T>> {
  const headers: HeadersInit = {
    ...(body ? JSON_HEADERS : {}),
    ...(options.allowLockedQuizEdit
      ? { [LOCKED_QUIZ_EDIT_HEADER]: "true" }
      : {}),
  };
  const init: RequestInit = body
    ? {
        ...FETCH_INIT,
        method,
        headers,
        body: JSON.stringify(body),
      }
    : { ...FETCH_INIT, method, headers };
  const response = await fetch(path, init);
  return (await response.json()) as AdminApiResult<T>;
}

// ---------- Quizzes ------------------------------------------------------

export function listAdminQuizzes() {
  return getJson<AdminQuizListResponse>("/api/admin/quizzes");
}

export function createAdminQuiz(body: AdminQuizCreateRequest) {
  return bodyJson<AdminQuizCreateResponse>(
    "/api/admin/quizzes",
    "POST",
    body as unknown as AdminRequestBody,
  );
}

export function getAdminQuiz(quizId: string) {
  return getJson<AdminQuizDetailResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}`,
  );
}

export function updateAdminQuiz(
  quizId: string,
  body: AdminQuizUpdateRequest,
  options?: LockedQuizEditOptions,
) {
  return bodyJson<AdminQuizDetailResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}`,
    "PUT",
    body as unknown as AdminRequestBody,
    options,
  );
}

export function archiveAdminQuiz(quizId: string) {
  return bodyJson<AdminQuizDeleteResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}`,
    "DELETE",
  );
}

export function hardDeleteAdminQuiz(quizId: string) {
  return bodyJson<AdminQuizHardDeleteResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}?hard=true`,
    "DELETE",
  );
}

export function unarchiveAdminQuiz(quizId: string) {
  return bodyJson<AdminQuizUnarchiveResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/unarchive`,
    "POST",
  );
}

export function duplicateAdminQuiz(quizId: string) {
  return bodyJson<AdminQuizDuplicateResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/duplicate`,
    "POST",
  );
}

// ---------- Questions ----------------------------------------------------

export function listAdminQuestions(quizId: string) {
  return getJson<AdminQuestionListResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions`,
  );
}

export function createAdminQuestion(
  quizId: string,
  body: AdminQuestionCreateRequest,
  options?: LockedQuizEditOptions,
) {
  return bodyJson<AdminQuestionUpsertResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions`,
    "POST",
    body as unknown as AdminRequestBody,
    options,
  );
}

export function updateAdminQuestion(
  quizId: string,
  questionId: string,
  body: AdminQuestionUpdateRequest,
  options?: LockedQuizEditOptions,
) {
  return bodyJson<AdminQuestionUpsertResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}`,
    "PUT",
    body as unknown as AdminRequestBody,
    options,
  );
}

export function deleteAdminQuestion(
  quizId: string,
  questionId: string,
  options?: LockedQuizEditOptions,
) {
  return bodyJson<AdminQuestionDeleteResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}`,
    "DELETE",
    undefined,
    options,
  );
}

export function reorderAdminQuestions(
  quizId: string,
  body: AdminQuestionReorderRequest,
  options?: LockedQuizEditOptions,
) {
  return bodyJson<AdminQuestionReorderResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/reorder`,
    "POST",
    body as unknown as AdminRequestBody,
    options,
  );
}

// ---------- Sessions -----------------------------------------------------

export function listAdminSessions(quizId?: string, includeArchived = false) {
  const params = new URLSearchParams();
  if (quizId) params.set("quizId", quizId);
  if (includeArchived) params.set("includeArchived", "1");
  const search = params.size > 0 ? `?${params.toString()}` : "";
  return getJson<AdminSessionListResponse>(`/api/admin/sessions${search}`);
}

export function archiveAdminSession(sessionId: string) {
  return bodyJson<AdminSessionArchiveResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}`,
    "DELETE",
  );
}

export function hardDeleteAdminSession(sessionId: string) {
  return bodyJson<AdminSessionHardDeleteResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}?hard=true`,
    "DELETE",
  );
}

export function createAdminSession(body: AdminSessionCreateRequest) {
  return bodyJson<AdminSessionCreateResponse>(
    "/api/admin/sessions",
    "POST",
    body as unknown as AdminRequestBody,
  );
}

export function getAdminSessionResults(sessionId: string) {
  return getJson<AdminSessionResultsResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}/results`,
  );
}

export function updateAdminSessionHost(
  sessionId: string,
  body: AdminSessionPatchHostRequest,
) {
  return bodyJson<AdminSessionPatchHostResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}`,
    "PATCH",
    body as unknown as AdminRequestBody,
  );
}

// ---------- Team ---------------------------------------------------------

export function listAdminTeam() {
  return getJson<AdminTeamListResponse>("/api/admin/team");
}
