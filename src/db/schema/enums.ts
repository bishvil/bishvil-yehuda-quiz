import { pgEnum } from "drizzle-orm/pg-core";

import {
  ASYNC_QUESTION_STATUSES,
  GAME_MODES,
  PARTICIPANT_STATUSES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SESSION_STATUSES,
} from "@/src/lib/constants";

export const gameModeEnum = pgEnum("game_mode", GAME_MODES);
export const sessionStatusEnum = pgEnum("session_status", SESSION_STATUSES);
export const participantStatusEnum = pgEnum(
  "participant_status",
  PARTICIPANT_STATUSES,
);
export const questionTypeEnum = pgEnum("question_type", QUESTION_TYPES);
export const questionStatusEnum = pgEnum("question_status", QUESTION_STATUSES);
export const asyncQuestionStatusEnum = pgEnum(
  "async_question_status",
  ASYNC_QUESTION_STATUSES,
);
