import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { asyncQuestionStatusEnum, questionStatusEnum } from "./enums";
import { sessionParticipants } from "./participants";
import { questions } from "./quizzes";
import { sessions } from "./sessions";

export const questionSessionState = pgTable(
  "question_session_state",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    status: questionStatusEnum("status").notNull().default("idle"),
    presentingAt: timestamp("presenting_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "question_session_state_session_id_question_id_pk",
      columns: [table.sessionId, table.questionId],
    }),
  ],
);

export const participantQuestionProgress = pgTable(
  "participant_question_progress",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => sessionParticipants.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    status: asyncQuestionStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "participant_question_progress_session_participant_question_pk",
      columns: [table.sessionId, table.participantId, table.questionId],
    }),
  ],
);
