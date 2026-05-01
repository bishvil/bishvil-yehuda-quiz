import { decodeJwt } from "jose";

import type { AuthRole } from "@/src/lib/constants";

export interface ParticipantJwtClaims {
  role: "authenticated";
  app_metadata?: {
    role?: AuthRole;
    session_id?: string;
    participant_id?: string;
  };
  sub?: string;
}

export function decodeParticipantAccessTokenUnsafe(
  accessToken: string,
): ParticipantJwtClaims {
  return decodeJwt(accessToken) as ParticipantJwtClaims;
}

export function hasExpectedParticipantScope(
  claims: ParticipantJwtClaims,
  expectedSessionId: string,
  expectedParticipantId: string,
): boolean {
  return (
    claims.app_metadata?.role === "participant" &&
    claims.app_metadata.session_id === expectedSessionId &&
    claims.app_metadata.participant_id === expectedParticipantId
  );
}
