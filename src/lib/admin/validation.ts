import { z } from "zod";

import {
  GAME_MODES,
  QUESTION_TYPES,
  DEFAULT_QUESTION_TIME_SECONDS,
  DEFAULT_QUESTION_POINTS,
  DEFAULT_JOIN_FIELDS,
} from "@/src/lib/constants";

const brandIdSchema = z.string().min(1);

const joinFieldSchema = z.enum([...DEFAULT_JOIN_FIELDS, "team"] as const);
export const joinFieldsSchema = z.array(joinFieldSchema).min(1);

export const adminQuizCreateSchema = z.object({
  brandId: brandIdSchema,
  title: z.string().trim().min(1),
  defaultGameMode: z.enum(GAME_MODES),
  customLogo: z.string().url().optional(),
  customLogoLabel: z.string().min(1).optional(),
  joinFields: joinFieldsSchema.optional(),
});

export const adminQuizUpdateSchema = adminQuizCreateSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
});

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  image_url: z.string().url().optional(),
});

const mapSchema = z.object({
  image_url: z.string().url(),
  target: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
});

export const adminQuestionCreateSchema = z.object({
  ordinal: z.number().int().min(1),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1),
  options: z.array(optionSchema).optional(),
  correctIds: z.array(z.string().min(1)).optional(),
  map: mapSchema.optional(),
  imageUrl: z.string().url().optional(),
  explanation: z.string().min(1).optional(),
  timeSeconds: z.number().int().min(1).default(DEFAULT_QUESTION_TIME_SECONDS),
  points: z.number().int().min(1).default(DEFAULT_QUESTION_POINTS),
  tolerance: z.number().min(0).max(100).optional(),
});

export const adminQuestionUpdateSchema = adminQuestionCreateSchema.partial();

export const adminSessionCreateSchema = z.object({
  quizId: z.string().uuid(),
  hostUserId: z.string().uuid().optional(),
  endedAt: z.string().datetime().optional(),
});

export type AdminQuizCreate = z.infer<typeof adminQuizCreateSchema>;
export type AdminQuizUpdate = z.infer<typeof adminQuizUpdateSchema>;
export type AdminQuestionCreate = z.infer<typeof adminQuestionCreateSchema>;
export type AdminQuestionUpdate = z.infer<typeof adminQuestionUpdateSchema>;
export type AdminSessionCreate = z.infer<typeof adminSessionCreateSchema>;
