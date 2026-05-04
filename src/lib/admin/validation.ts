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
  customLogoActive: z.boolean().optional(),
  joinFields: joinFieldsSchema.optional(),
});

/**
 * Update schema deliberately diverges from create on the nullable logo
 * fields. Wave-2 review M1: clearing `customLogo` / `customLogoLabel` from
 * the editor must persist as `null`, so the PUT body has to accept
 * `null` (not just omit-or-string). Create stays strict because there is
 * no nothing-to-clear at construction time.
 */
export const adminQuizUpdateSchema = adminQuizCreateSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
  customLogo: z.string().url().nullable().optional(),
  customLogoLabel: z.string().min(1).nullable().optional(),
  customLogoActive: z.boolean().optional(),
});

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  image_url: z.string().url().optional(),
});

/** Geographic map (ADR-0011 §6.1). */
const mapSchema = z.object({
  geo: z.object({
    target: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    center: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    zoom: z.number().min(1).max(18).optional(),
    toleranceKm: z.number().min(0.05).max(500),
    styleHint: z
      .enum(["maptiler-streets", "israel-hiking", "osm-liberty"])
      .optional(),
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
});

export const adminQuestionUpdateSchema = adminQuestionCreateSchema.partial();

export const adminQuestionReorderSchema = z.object({
  ordinals: z.array(
    z.object({
      id: z.string().uuid(),
      ordinal: z.number().int().min(1),
    }),
  ),
});

export const adminSessionCreateSchema = z.object({
  quizId: z.string().uuid(),
  hostUserId: z.string().uuid().optional(),
  endedAt: z.string().datetime().optional(),
});

export type AdminQuizCreate = z.infer<typeof adminQuizCreateSchema>;
export type AdminQuizUpdate = z.infer<typeof adminQuizUpdateSchema>;
export type AdminQuestionCreate = z.infer<typeof adminQuestionCreateSchema>;
export type AdminQuestionUpdate = z.infer<typeof adminQuestionUpdateSchema>;
export type AdminQuestionReorder = z.infer<typeof adminQuestionReorderSchema>;
export type AdminSessionCreate = z.infer<typeof adminSessionCreateSchema>;

// ---- Brand CRUD schemas ----

export const adminBrandCreateSchema = z.object({
  name: z.string().trim().min(1),
  tagline: z.string().trim().optional(),
  logoUrl: z.string().url(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/**
 * For user-created (non-system) brands: all fields are patchable.
 */
export const adminBrandUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  tagline: z.string().trim().nullable().optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

/**
 * For system brands: only cosmetic fields (tagline, colors) may be changed.
 * Uses `.strict()` so any extra field (name, logoUrl) is rejected at parse time.
 */
export const adminBrandSystemUpdateSchema = z
  .object({
    tagline: z.string().trim().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  })
  .strict();

export type AdminBrandCreate = z.infer<typeof adminBrandCreateSchema>;
export type AdminBrandUpdate = z.infer<typeof adminBrandUpdateSchema>;
export type AdminBrandSystemUpdate = z.infer<typeof adminBrandSystemUpdateSchema>;
