import { z } from "zod";

import {
  GAME_MODES,
  QUESTION_TYPES,
  DEFAULT_QUESTION_TIME_SECONDS,
  DEFAULT_QUESTION_POINTS,
  DEFAULT_JOIN_FIELDS,
} from "@/src/lib/constants";

const brandIdSchema = z.string().min(1);

// Allow https everywhere; additionally allow the configured Supabase origin
// (which in local dev is http://127.0.0.1:54321) so uploads work in local
// development without weakening prod, where Supabase is *.supabase.co/https.
const localSupabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
})();

const httpsUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      if (/^https:\/\//i.test(value)) return true;
      if (localSupabaseOrigin && value.startsWith(localSupabaseOrigin + "/")) {
        return true;
      }
      return false;
    },
    {
      message:
        "URL must use https:// (or the configured Supabase origin in dev).",
    },
  );

const joinFieldSchema = z.enum([...DEFAULT_JOIN_FIELDS, "team"] as const);
export const joinFieldsSchema = z.array(joinFieldSchema).min(1);

export const adminQuizCreateSchema = z.object({
  brandId: brandIdSchema,
  title: z.string().trim().min(1),
  defaultGameMode: z.enum(GAME_MODES),
  customLogo: httpsUrlSchema.optional(),
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
  customLogo: httpsUrlSchema.nullable().optional(),
  customLogoLabel: z.string().min(1).nullable().optional(),
  customLogoActive: z.boolean().optional(),
});

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  image_url: httpsUrlSchema.optional(),
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

// The editor clears optional fields by sending `null` (not by omitting them),
// so persisted-clearable fields are `.nullable().optional()`. Keep `null`
// as "explicit clear" and `undefined` as "no change".
export const adminQuestionCreateSchema = z.object({
  ordinal: z.number().int().min(1),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1),
  options: z.array(optionSchema).optional(),
  correctIds: z.array(z.string().min(1)).optional(),
  map: mapSchema.nullable().optional(),
  imageUrl: httpsUrlSchema.nullable().optional(),
  imageAlt: z.string().trim().min(1).max(500).nullable().optional(),
  imageWidth: z.number().int().positive().nullable().optional(),
  imageHeight: z.number().int().positive().nullable().optional(),
  imagePath: z.string().min(1).nullable().optional(),
  explanation: z.string().min(1).nullable().optional(),
  timeSeconds: z.number().int().min(1).default(DEFAULT_QUESTION_TIME_SECONDS),
  points: z.number().int().min(1).default(DEFAULT_QUESTION_POINTS),
  // Video fields — all optional/nullable so auto-save partial patches work.
  // The route handlers apply additional validation: videoEmbedUrl is passed
  // through parseVideoEmbed (normalised URL + provider); videoUrl and
  // videoEmbedUrl cannot both be non-null.
  videoUrl: httpsUrlSchema.nullable().optional(),
  videoPath: z.string().min(1).nullable().optional(),
  videoEmbedUrl: z.string().url().max(2048).nullable().optional(),
  videoProvider: z.enum(["self", "youtube", "vimeo"]).nullable().optional(),
  videoMimeType: z.string().min(1).nullable().optional(),
  videoDurationSeconds: z.number().int().min(1).nullable().optional(),
  videoPosterUrl: httpsUrlSchema.nullable().optional(),
  videoPosterPath: z.string().min(1).nullable().optional(),
  videoWidth: z.number().int().positive().nullable().optional(),
  videoHeight: z.number().int().positive().nullable().optional(),
  mediaLeadSeconds: z.number().int().min(0).max(600).optional(),
});

// PATCH semantics: missing keys mean "no change", so we strip the
// `.default(...)` from `timeSeconds` and `points` before partial-ing.
// Otherwise zod would inject the create-time defaults on every partial
// PUT and silently overwrite stored values.
export const adminQuestionUpdateSchema = adminQuestionCreateSchema
  .extend({
    timeSeconds: z.number().int().min(1),
    points: z.number().int().min(1),
  })
  .partial();

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
 * Kept as an alias of {@link adminBrandUpdateSchema}. Historically system
 * brands were locked down to cosmetic fields only, but the product now allows
 * admins to edit name and logo for system brands too — they remain protected
 * from deletion (see DELETE handler), not from edits.
 */
export const adminBrandSystemUpdateSchema = adminBrandUpdateSchema;

export type AdminBrandCreate = z.infer<typeof adminBrandCreateSchema>;
export type AdminBrandUpdate = z.infer<typeof adminBrandUpdateSchema>;
export type AdminBrandSystemUpdate = z.infer<typeof adminBrandSystemUpdateSchema>;
