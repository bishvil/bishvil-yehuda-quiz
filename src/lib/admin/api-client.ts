/**
 * Typed fetchers for the admin-facing API endpoints. Mirrors the host client
 * pattern (`cache: "no-store"` + `credentials: "include"`) so the Supabase
 * SSR cookie set by /api/auth/admin/signin rides along on every request.
 *
 * Per ADR-0004 §"Admin Role" + ADR-0008 §5: admin payloads are private —
 * the server already replies with `Cache-Control: private, no-store`; we
 * still pass `cache: "no-store"` here so Next never serves a stale RSC.
 */
import type {
  Json,
  QuestionOption,
} from "@/src/lib/supabase/database.types";
import type {
  GameMode,
  QuestionType,
  SessionStatus,
} from "@/src/lib/constants";
import type { EditableQuestionMap } from "@/src/lib/admin/quiz-editor";

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

const FETCH_INIT: RequestInit = {
  cache: "no-store",
  credentials: "include",
};

// ---------- Quiz list ----------------------------------------------------

export interface AdminQuizListItem {
  id: string;
  title: string;
  brandId: string;
  defaultGameMode: GameMode;
  customLogoActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  questionCount?: number;
  sessionCount?: number;
}

export interface AdminQuizListResponse {
  quizzes: AdminQuizListItem[];
}

export interface AdminQuizCreateRequest {
  brandId: string;
  title: string;
  defaultGameMode: GameMode;
  customLogo?: string;
  customLogoLabel?: string;
  customLogoActive?: boolean;
  joinFields?: string[];
}

export interface AdminQuizCreateResponse {
  quiz: AdminQuizListItem;
}

// ---------- Quiz detail --------------------------------------------------

export interface AdminQuizDetail {
  id: string;
  title: string;
  brandId: string;
  defaultGameMode: GameMode;
  customLogo: string | null;
  customLogoLabel: string | null;
  customLogoActive: boolean;
  joinFields: string[];
  archivedAt: string | null;
  createdAt: string;
}

export interface AdminQuizDetailResponse {
  quiz: AdminQuizDetail;
}

/**
 * Update payload deliberately differs from create on the nullable logo
 * fields. Wave-2 review M1 — the editor must be able to send explicit
 * `null` to clear `customLogo` / `customLogoLabel` (omitting them leaves
 * the previously-saved value in place because the PUT route only writes
 * keys that are `!== undefined`). Create stays string-only because there
 * is nothing to clear at construction time.
 */
export interface AdminQuizUpdateRequest
  extends Partial<Omit<AdminQuizCreateRequest, "customLogo" | "customLogoLabel" | "customLogoActive">> {
  archivedAt?: string | null;
  customLogo?: string | null;
  customLogoLabel?: string | null;
  customLogoActive?: boolean;
}

export interface AdminQuizDeleteResponse {
  status: "archived";
  archivedAt: string;
}

export interface AdminQuizUnarchiveResponse {
  status: "active";
  archivedAt: null;
}

export interface AdminQuizHardDeleteResponse {
  status: "deleted";
  id: string;
}

// ---------- Questions ----------------------------------------------------

export interface AdminQuestionListItem {
  id: string;
  ordinal: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[] | null;
  correctIds: string[] | null;
  map: EditableQuestionMap | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imagePath: string | null;
  explanation: string | null;
  timeSeconds: number;
  points: number;
  createdAt?: string;
}

export interface AdminQuestionListResponse {
  questions: AdminQuestionListItem[];
}

export interface AdminQuestionCreateRequest {
  ordinal: number;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  correctIds?: string[];
  map?: EditableQuestionMap;
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  imagePath?: string;
  explanation?: string;
  timeSeconds?: number;
  points?: number;
}

export type AdminQuestionUpdateRequest = Partial<AdminQuestionCreateRequest>;

export interface AdminQuestionUpsertResponse {
  question: AdminQuestionListItem;
  /**
   * Populated when the admin used `?force=1` to mutate a score-affecting
   * field on a quiz with existing submissions. The editor should prompt
   * the user to rescore each affected session via `rescoreAdminSession`.
   */
  requiresRescore?: string[];
}

export interface AdminQuestionDeleteResponse {
  status: "deleted";
}

export interface AdminQuestionReorderRequest {
  ordinals: Array<{ id: string; ordinal: number }>;
}

export interface AdminQuestionReorderResponse {
  status: "reordered";
  count: number;
}

// ---------- Sessions -----------------------------------------------------

export interface AdminSessionCreateRequest {
  quizId: string;
  hostUserId?: string;
}

export interface AdminSessionListRow {
  id: string;
  pin: string;
  quizId: string;
  status: "draft" | "scheduled" | "live" | "paused" | "ended";
  gameMode: GameMode;
  autoReveal: boolean;
  hostId: string | null;
  hostEmail: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface AdminSessionArchiveResponse {
  status: "archived";
  archivedAt: string;
}

export interface AdminSessionHardDeleteResponse {
  status: "deleted";
  id: string;
}

export interface AdminSessionListResponse {
  sessions: AdminSessionListRow[];
}

export interface AdminSessionCreateResponse {
  session: {
    id: string;
    pin: string;
    quizId: string;
    status: "scheduled";
    gameMode: GameMode;
    autoReveal: boolean;
    hostId: string | null;
    hostEmail: string | null;
    endedAt: string | null;
    createdAt: string;
  };
}

export interface AdminSessionPatchHostRequest {
  hostUserId: string;
}

export interface AdminSessionPatchHostResponse {
  session: AdminSessionListRow;
}

export interface AdminSessionRescoreResponse {
  rescoredCount: number;
  totalScoreDelta: number;
  participantsTouched: number;
}

// ---------- Team ---------------------------------------------------------

export interface AdminTeamMember {
  id: string;
  email: string;
  role: "admin" | "host";
  lastSignInAt: string | null;
  createdAt: string;
}

export interface AdminTeamListResponse {
  members: AdminTeamMember[];
  currentUserId: string;
}

// ---------- Results ------------------------------------------------------

export interface AdminSessionResultPlayer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  unit: string | null;
  team: string | null;
  status: "joined" | "in_progress" | "completed";
  totalScore: number;
  correctCount: number;
  streak: number;
  joinedAt: string;
}

export interface AdminSessionResultAnswer {
  questionId: string;
  participantId: string;
  submittedAt: string;
  selectedIds: string[] | null;
  pinLat: string | null;
  pinLng: string | null;
  isCorrect: boolean;
  score: number;
  timeBonus: number;
}

export interface AdminSessionResultsResponse {
  session: {
    id: string;
    pin: string;
    status: SessionStatus;
    gameMode: GameMode;
    startedAt: string | null;
    endedAt: string | null;
  };
  players: AdminSessionResultPlayer[];
  answers: AdminSessionResultAnswer[];
}

// ---------- Errors -------------------------------------------------------

export interface AdminApiErrorBody {
  error: string;
  message: string;
}

export type AdminApiResult<T> = T | AdminApiErrorBody;

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
  body?: Json,
): Promise<AdminApiResult<T>> {
  const init: RequestInit = body
    ? {
        ...FETCH_INIT,
        method,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      }
    : { ...FETCH_INIT, method };
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
    body as unknown as Json,
  );
}

export function getAdminQuiz(quizId: string) {
  return getJson<AdminQuizDetailResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}`,
  );
}

export function updateAdminQuiz(quizId: string, body: AdminQuizUpdateRequest) {
  return bodyJson<AdminQuizDetailResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}`,
    "PUT",
    body as unknown as Json,
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

// ---------- Questions ----------------------------------------------------

export function listAdminQuestions(quizId: string) {
  return getJson<AdminQuestionListResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions`,
  );
}

export function createAdminQuestion(
  quizId: string,
  body: AdminQuestionCreateRequest,
) {
  return bodyJson<AdminQuestionUpsertResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions`,
    "POST",
    body as unknown as Json,
  );
}

export function updateAdminQuestion(
  quizId: string,
  questionId: string,
  body: AdminQuestionUpdateRequest,
  options: { force?: boolean } = {},
) {
  const qs = options.force ? "?force=1" : "";
  return bodyJson<AdminQuestionUpsertResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}${qs}`,
    "PUT",
    body as unknown as Json,
  );
}

export function deleteAdminQuestion(quizId: string, questionId: string) {
  return bodyJson<AdminQuestionDeleteResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/${encodeURIComponent(questionId)}`,
    "DELETE",
  );
}

export function reorderAdminQuestions(
  quizId: string,
  body: AdminQuestionReorderRequest,
) {
  return bodyJson<AdminQuestionReorderResponse>(
    `/api/admin/quizzes/${encodeURIComponent(quizId)}/questions/reorder`,
    "POST",
    body as unknown as Json,
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
    body as unknown as Json,
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
    body as unknown as Json,
  );
}

export function rescoreAdminSession(sessionId: string) {
  return bodyJson<AdminSessionRescoreResponse>(
    `/api/admin/sessions/${encodeURIComponent(sessionId)}/rescore`,
    "POST",
  );
}

// ---------- Team ---------------------------------------------------------

export function listAdminTeam() {
  return getJson<AdminTeamListResponse>("/api/admin/team");
}
