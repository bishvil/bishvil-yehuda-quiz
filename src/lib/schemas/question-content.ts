import { z } from "zod";

import type { QuestionTypeEnum } from "@/src/lib/supabase/database.types";

export const storedQuestionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  image_url: z.string().min(1).optional(),
});

export const storedQuestionOptionsSchema = z.array(storedQuestionOptionSchema);

const storedQuestionMapGeoTargetSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const storedQuestionMapGeoCenterSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const storedQuestionMapStyleHintSchema = z.enum([
  "maptiler-streets",
  "israel-hiking",
  "osm-liberty",
]);

const storedQuestionMapGeoSchema = z.object({
  target: storedQuestionMapGeoTargetSchema,
  center: storedQuestionMapGeoCenterSchema.optional(),
  zoom: z.number().min(1).max(18).optional(),
  toleranceKm: z.number().min(0.05).max(500),
  styleHint: storedQuestionMapStyleHintSchema.optional(),
});

export const storedQuestionMapSchema = z.object({
  geo: storedQuestionMapGeoSchema,
});

export type StoredQuestionOption = z.infer<typeof storedQuestionOptionSchema>;
export type StoredQuestionMap = z.infer<typeof storedQuestionMapSchema>;
export type StoredQuestionMapGeo = z.infer<typeof storedQuestionMapGeoSchema>;

export interface StoredQuestionContentIssue {
  path: Array<string | number>;
  message: string;
}

const optionQuestionTypes = new Set<QuestionTypeEnum>([
  "single",
  "multi",
  "truefalse",
  "image",
]);

export function parseStoredQuestionOptions(value: unknown):
  | { success: true; data: StoredQuestionOption[] | null }
  | { success: false; error: z.ZodError } {
  if (value === null || value === undefined) {
    return { success: true, data: null };
  }

  const parsed = storedQuestionOptionsSchema.safeParse(value);
  if (!parsed.success) return parsed;
  return { success: true, data: parsed.data };
}

export function parseStoredQuestionMap(value: unknown):
  | { success: true; data: StoredQuestionMap | null }
  | { success: false; error: z.ZodError } {
  if (value === null || value === undefined) {
    return { success: true, data: null };
  }

  const parsed = storedQuestionMapSchema.safeParse(value);
  if (!parsed.success) return parsed;
  return { success: true, data: parsed.data };
}

export function validateStoredQuestionContent(args: {
  type: QuestionTypeEnum;
  options: unknown;
  map: unknown;
}):
  | {
      success: true;
      data: {
        options: StoredQuestionOption[] | null;
        map: StoredQuestionMap | null;
      };
    }
  | { success: false; issues: StoredQuestionContentIssue[] } {
  const options = parseStoredQuestionOptions(args.options);
  const map = parseStoredQuestionMap(args.map);
  const issues: StoredQuestionContentIssue[] = [];

  if (!options.success) {
    issues.push(
      ...options.error.issues.map((issue) => ({
        path: issue.path.map((part) => String(part)),
        message: issue.message,
      })),
    );
  }

  if (!map.success) {
    issues.push(
      ...map.error.issues.map((issue) => ({
        path: issue.path.map((part) => String(part)),
        message: issue.message,
      })),
    );
  }

  const needsOptions = optionQuestionTypes.has(args.type);
  if (needsOptions && (!options.success || !options.data || options.data.length === 0)) {
    issues.push({
      path: ["options"],
      message: "Choice questions must have at least one valid option.",
    });
  }

  if (args.type === "map") {
    const data = map.success ? map.data : null;
    if (!data) {
      issues.push({
        path: ["map"],
        message: "Map questions must have a valid geo block (ADR-0011 §6.1).",
      });
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return {
    success: true,
    data: {
      options: options.success ? options.data : null,
      map: map.success ? map.data : null,
    },
  };
}
