export const GAME_MODES = ["sync", "async"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const SESSION_STATUSES = [
  "draft",
  "scheduled",
  "live",
  "paused",
  "ended",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const PARTICIPANT_STATUSES = [
  "joined",
  "in_progress",
  "completed",
] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const QUESTION_TYPES = [
  "single",
  "multi",
  "truefalse",
  "image",
  "map",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = [
  "idle",
  "presenting",
  "answering",
  "locked",
  "revealed",
] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ASYNC_QUESTION_STATUSES = [
  "answering",
  "locked",
  "revealed",
] as const;
export type AsyncQuestionStatus = (typeof ASYNC_QUESTION_STATUSES)[number];

export const DEFAULT_JOIN_FIELDS = ["name", "phone", "unit"] as const;
export type JoinField = (typeof DEFAULT_JOIN_FIELDS)[number];

export const DEFAULT_QUESTION_TIME_SECONDS = 25;
export const DEFAULT_QUESTION_POINTS = 1500;
export const PARTICIPANT_POLL_INTERVAL_MS = 5_000;
export const HOST_SESSION_TIMEOUT_MINUTES = 30;
