import { z } from "zod";

export const locationGateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().min(20).max(5000),
});
export const questionSettingsSchema = z.object({
  timeLimitEnabled: z.boolean().optional(),
  acceptedAnswers: z
    .array(z.string().trim().min(1).max(500))
    .max(50)
    .optional(),
  locationGate: locationGateSchema.nullable().optional(),
});
export type QuestionSettings = z.infer<typeof questionSettingsSchema>;
export type LocationGate = z.infer<typeof locationGateSchema>;
export function readQuestionSettings(value: unknown): QuestionSettings {
  const result = questionSettingsSchema.safeParse(value ?? {});
  return result.success ? result.data : {};
}
export function hasTimeLimit(type: string, value: unknown): boolean {
  return (
    type !== "content" && readQuestionSettings(value).timeLimitEnabled !== false
  );
}
