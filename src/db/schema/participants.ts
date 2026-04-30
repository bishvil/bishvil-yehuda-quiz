import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { participantStatusEnum } from "./enums";
import { sessions } from "./sessions";

export const sessionParticipants = pgTable(
  "session_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone").notNull(),
    unit: text("unit"),
    team: text("team"),
    status: participantStatusEnum("status").notNull().default("joined"),
    streak: integer("streak").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    displayName: text("display_name")
      .generatedAlwaysAs(
        sql`${sql.identifier("first_name")} || ' ' || left(${sql.identifier("last_name")}, 1) || '.'`,
      )
      .notNull(),
  },
  (table) => [
    uniqueIndex("session_participants_session_id_phone_idx").on(
      table.sessionId,
      table.phone,
    ),
    uniqueIndex("session_participants_session_id_id_idx").on(
      table.sessionId,
      table.id,
    ),
  ],
);
