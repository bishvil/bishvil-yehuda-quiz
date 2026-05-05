import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  DEFAULT_JOIN_FIELDS,
  DEFAULT_QUESTION_POINTS,
  DEFAULT_QUESTION_TIME_SECONDS,
  type JoinField,
} from "@/src/lib/constants";

import { gameModeEnum, questionTypeEnum } from "./enums";

export interface QuestionOption {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface MapGeoTarget {
  lat: number;
  lng: number;
}

export interface QuestionMap {
  geo: {
    target: MapGeoTarget;
    center?: MapGeoTarget;
    zoom?: number;
    toleranceKm: number;
    styleHint?: "maptiler-streets" | "israel-hiking" | "osm-liberty";
  };
}

export const quizzes = pgTable("quizzes", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  brandId: text("brand_id").notNull(),
  title: text("title").notNull(),
  defaultGameMode: gameModeEnum("default_game_mode").notNull(),
  joinFields: jsonb("join_fields")
    .$type<readonly JoinField[]>()
    .notNull()
    .default(sql.raw(`'${JSON.stringify(DEFAULT_JOIN_FIELDS)}'::jsonb`)),
  customLogo: text("custom_logo"),
  customLogoLabel: text("custom_logo_label"),
  customLogoActive: boolean("custom_logo_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    type: questionTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<readonly QuestionOption[]>(),
    correctIds: text("correct_ids").array(),
    map: jsonb("map").$type<QuestionMap>(),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    imagePath: text("image_path"),
    videoUrl: text("video_url"),
    videoPath: text("video_path"),
    videoEmbedUrl: text("video_embed_url"),
    videoProvider: text("video_provider").$type<"self" | "youtube" | "vimeo">(),
    videoMimeType: text("video_mime_type"),
    videoDurationSeconds: integer("video_duration_seconds"),
    videoPosterUrl: text("video_poster_url"),
    videoWidth: integer("video_width"),
    videoHeight: integer("video_height"),
    mediaLeadSeconds: integer("media_lead_seconds").notNull().default(0),
    explanation: text("explanation"),
    timeSeconds: integer("time_seconds")
      .notNull()
      .default(DEFAULT_QUESTION_TIME_SECONDS),
    points: integer("points").notNull().default(DEFAULT_QUESTION_POINTS),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("questions_quiz_id_ordinal_idx").on(table.quizId, table.ordinal),
  ],
);
