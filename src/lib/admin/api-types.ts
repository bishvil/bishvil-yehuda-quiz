import type { Json, QuestionOption } from "@/src/lib/supabase/database.types";
import type {
  GameMode,
  QuestionType,
  SessionStatus,
} from "@/src/lib/constants";
import type { EditableQuestionMap } from "@/src/lib/admin/quiz-editor";

export interface LockedQuizEditOptions {
  allowLockedQuizEdit?: boolean;
}

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
  hasAnySession: boolean;
}

export interface AdminQuizDuplicateResponse {
  quiz: {
    id: string;
    title: string;
  };
}

export interface AdminQuizDetailResponse {
  quiz: AdminQuizDetail;
}

export interface AdminQuizUpdateRequest extends Partial<
  Omit<
    AdminQuizCreateRequest,
    "customLogo" | "customLogoLabel" | "customLogoActive"
  >
> {
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
  videoUrl: string | null;
  videoPath: string | null;
  videoEmbedUrl: string | null;
  videoProvider: "self" | "youtube" | "vimeo" | null;
  videoMimeType: string | null;
  videoDurationSeconds: number | null;
  videoPosterUrl: string | null;
  videoPosterPath: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  mediaLeadSeconds: number;
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
  videoUrl?: string | null;
  videoPath?: string | null;
  videoEmbedUrl?: string | null;
  videoProvider?: "self" | "youtube" | "vimeo" | null;
  videoMimeType?: string | null;
  videoDurationSeconds?: number | null;
  videoPosterUrl?: string | null;
  videoPosterPath?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  mediaLeadSeconds?: number;
}

export type AdminQuestionUpdateRequest = Partial<AdminQuestionCreateRequest>;

export interface AdminQuestionUpsertResponse {
  question: AdminQuestionListItem;
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

export interface AdminApiErrorBody {
  error: string;
  message: string;
}

export type AdminApiResult<T> = T | AdminApiErrorBody;

export type AdminRequestBody = Json;
