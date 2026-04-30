import { z } from "zod";

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

export type ParticipantJoinRequest = z.infer<typeof participantJoinRequestSchema>;
export type PasswordSignInRequest = z.infer<typeof passwordSignInRequestSchema>;
