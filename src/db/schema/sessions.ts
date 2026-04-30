import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { gameModeEnum, sessionStatusEnum } from "./enums";
import { questions, quizzes } from "./quizzes";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    hostId: uuid("host_id"),
    pin: text("pin").notNull(),
    status: sessionStatusEnum("status").notNull().default("draft"),
    gameMode: gameModeEnum("game_mode").notNull(),
    autoReveal: boolean("auto_reveal").notNull().default(false),
    currentQuestionId: uuid("current_question_id").references(() => questions.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    hostLastSeenAt: timestamp("host_last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_pin_active_idx")
      .on(table.pin)
      .where(sql`${table.status} in ('scheduled', 'live')`),
    index("sessions_quiz_id_idx").on(table.quizId),
  ],
);
