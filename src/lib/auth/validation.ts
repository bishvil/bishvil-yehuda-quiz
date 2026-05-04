import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

export const participantJoinRequestSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  unit: z.string().trim().min(1).optional(),
  team: z.string().trim().min(1).optional(),
});

export const passwordSignInRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const teamRoleSchema = z.enum(["admin", "host"]);

export const teamCreateSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  role: teamRoleSchema,
});

export const teamPatchSchema = z.object({
  userId: z.string().uuid(),
  role: teamRoleSchema,
});

export const teamUserIdSchema = z.object({
  userId: z.string().uuid(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const choiceAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedIds: z.array(z.string().min(1)).min(1),
});

/** Geographic-pin map answer (ADR-0011 §5). */
export const mapGeoAnswerSchema = z.object({
  questionId: z.string().uuid(),
  pin: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export const submitAnswerRequestSchema = z.union([
  choiceAnswerSchema,
  mapGeoAnswerSchema,
]);

export type ParticipantJoinRequest = z.infer<typeof participantJoinRequestSchema>;
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;
export type SubmitAnswerRequest = z.infer<typeof submitAnswerRequestSchema>;
