import { describe, expect, it } from "vitest";

import {
  decodeParticipantAccessToken,
  hasExpectedParticipantScope,
} from "@/src/lib/auth/claims";

const sessionId = "44444444-4444-4444-8444-444444444444";
const participantId = "55555555-5555-4555-8555-555555555555";

describe("participant JWT claims", () => {
  it("verifies the scoped participant payload shape used after join", async () => {
    const accessToken = createUnsignedTestJwt({
      role: "authenticated",
      app_metadata: {
        role: "participant",
        session_id: sessionId,
        participant_id: participantId,
      },
      sub: participantId,
    });

    const claims = decodeParticipantAccessToken(accessToken);

    expect(hasExpectedParticipantScope(claims, sessionId, participantId)).toBe(
      true,
    );
  });

  it("rejects participant tokens scoped to another row", async () => {
    const accessToken = createUnsignedTestJwt({
      role: "authenticated",
      app_metadata: {
        role: "participant",
        session_id: sessionId,
        participant_id: participantId,
      },
      sub: participantId,
    });

    const claims = decodeParticipantAccessToken(accessToken);

    expect(
      hasExpectedParticipantScope(
        claims,
        sessionId,
        "66666666-6666-4666-8666-666666666666",
      ),
    ).toBe(false);
  });
});

function createUnsignedTestJwt(payload: Record<string, unknown>): string {
  const header = encodeJwtPart({ alg: "none", typ: "JWT" });
  const body = encodeJwtPart(payload);

  return `${header}.${body}.`;
}

function encodeJwtPart(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
