import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";

import { sessionParticipants } from "./participants";
import { questions } from "./quizzes";
import { sessions } from "./sessions";

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => sessionParticipants.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    selectedIds: text("selected_ids").array(),
    /** Geographic answer pin (ADR-0011 §6.3). */
    pinLat: numeric("pin_lat", { precision: 8, scale: 5 }),
    pinLng: numeric("pin_lng", { precision: 9, scale: 5 }),
    isCorrect: boolean("is_correct").notNull(),
    timeBonus: integer("time_bonus").notNull().default(0),
    score: integer("score").notNull().default(0),
    /** Populated for geo map answers only. Haversine distance in km. */
    distanceKm: numeric("distance_km", { precision: 10, scale: 3 }),
    /**
     * 0..1 ratio of how correct the answer was. Set for geo map and
     * multi-select. Null for single / truefalse / image — treat as
     * `is_correct ? 1.0 : 0.0` downstream.
     */
    correctnessRatio: numeric("correctness_ratio", { precision: 4, scale: 3 }),
  },
  (table) => [
    uniqueIndex("answers_session_question_participant_idx").on(
      table.sessionId,
      table.questionId,
      table.participantId,
    ),
  ],
);

export const participantScores = pgTable(
  "participant_scores",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => sessionParticipants.id, { onDelete: "cascade" }),
    totalScore: integer("total_score").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "participant_scores_session_id_participant_id_pk",
      columns: [table.sessionId, table.participantId],
    }),
  ],
);
