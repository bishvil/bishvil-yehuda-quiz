import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSessionMock, getUserMock, signOutMock } = vi.hoisted(
  () => ({
    exchangeCodeForSessionMock: vi.fn(),
    getUserMock: vi.fn(),
    signOutMock: vi.fn(),
  }),
);

vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: exchangeCodeForSessionMock,
      getUser: getUserMock,
      signOut: signOutMock,
    },
  }),
}));

vi.mock("@/src/lib/logging", () => ({
  writeLog: vi.fn(),
}));

import { GET } from "@/app/auth/oauth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  exchangeCodeForSessionMock.mockResolvedValue({ error: null });
  signOutMock.mockResolvedValue({ error: null });
});

describe("OAuth callback", () => {
  it("redirects staff users by their app role", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { app_metadata: { role: "admin" } } },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/auth/oauth/callback?code=code-1&flow=staff",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/quizzes",
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("signs out Google users without a staff role", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { app_metadata: {} } },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/auth/oauth/callback?code=code-1&flow=staff",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/auth/access-needed?reason=staff",
    );
    expect(signOutMock).toHaveBeenCalled();
  });

  it("returns participants to their PIN page after Google connects", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/auth/oauth/callback?code=code-1&flow=participant&pin=123456",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/123456?google=connected",
    );
  });
});
