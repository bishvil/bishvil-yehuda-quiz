import { beforeEach, describe, expect, it, vi } from "vitest";

const { browserAuthMock, insertPayloads, serviceFromMock, updateUserByIdMock } =
  vi.hoisted(() => ({
    browserAuthMock: {
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInAnonymously: vi.fn(),
      refreshSession: vi.fn(),
    },
    insertPayloads: [] as Array<Record<string, unknown>>,
    serviceFromMock: vi.fn(),
    updateUserByIdMock: vi.fn(),
  }));

vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: browserAuthMock,
  }),
  createServiceRoleSupabaseClient: async () => ({
    auth: {
      admin: {
        updateUserById: updateUserByIdMock,
      },
    },
    from: serviceFromMock,
  }),
}));

vi.mock("@/src/lib/auth/claims", () => ({
  decodeParticipantAccessTokenUnsafe: () => ({
    app_metadata: {
      role: "participant",
      session_id: "session-1",
      participant_id: "auth-user-1",
    },
  }),
  hasExpectedParticipantScope: () => true,
}));

async function callJoinPost(
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/session/[pin]/join/route");
  const request = new Request("http://localhost:3000/api/session/123456/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const response = await POST(
    request as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin: "123456" }) } as Parameters<
      typeof POST
    >[1],
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("POST /api/session/[pin]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertPayloads.length = 0;
    browserAuthMock.getUser.mockResolvedValue({
      data: {
        user: {
          id: "google-user-1",
          email: "dana@example.com",
          identities: [
            {
              provider: "google",
              id: "google-identity-id",
              identity_id: "google-identity-uuid",
              identity_data: { sub: "google-sub-123" },
            },
          ],
          user_metadata: {
            given_name: "Dana",
            family_name: "Cohen",
          },
        },
      },
      error: null,
    });
    browserAuthMock.signOut.mockResolvedValue({ error: null });
    browserAuthMock.signInAnonymously.mockResolvedValue({
      data: {
        user: { id: "auth-user-1" },
        session: {
          refresh_token: "refresh-token",
        },
      },
      error: null,
    });
    browserAuthMock.refreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
        },
      },
      error: null,
    });
    updateUserByIdMock.mockResolvedValue({ error: null });
    serviceFromMock.mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                maybeSingle: async () => ({
                  data: { id: "session-1" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "session_participants") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertPayloads.push(payload);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: "auth-user-1", session_id: "session-1" },
                  error: null,
                }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("rejects legacy phone-only joins because participants must use Google identity", async () => {
    const result = await callJoinPost({
      firstName: "Retry",
      lastName: "Participant",
      phone: "0501234567",
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: "INVALID_REQUEST" });
  });

  it("uses the Google provider subject as the participant identity key", async () => {
    const result = await callJoinPost({
      phone: "0501234567",
      identityProvider: "google",
    });

    expect(result.status).toBe(200);
    expect(insertPayloads[0]).toMatchObject({
      first_name: "Dana",
      last_name: "Cohen",
      phone: "+972501234567",
      identity_provider: "google",
      identity_key: "google-sub-123",
    });
    expect(insertPayloads[0]?.profile_fields).toMatchObject({
      email: "dana@example.com",
      phone: "+972501234567",
    });
  });
});
