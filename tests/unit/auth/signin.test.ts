import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
    },
  }),
}));

vi.mock("@/src/lib/logging", () => ({
  writeLog: vi.fn(),
}));

import { POST as adminSignInPost } from "@/app/api/auth/admin/signin/route";
import { POST as hostSignInPost } from "@/app/api/auth/host/signin/route";
import { POST as signInPost } from "@/app/api/auth/signin/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("password signin", () => {
  it.each([
    ["host route", hostSignInPost, "admin"],
    ["admin route", adminSignInPost, "host"],
    ["shared route", signInPost, "admin"],
  ] as const)(
    "returns the actual app role for valid credentials via the %s",
    async (_label, post, role) => {
      signInWithPasswordMock.mockResolvedValue({
        data: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: `${role}@bishvil.test`,
            app_metadata: { role },
          },
        },
        error: null,
      });

      const response = await post(signInRequest(`${role}@bishvil.test`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        role,
        userId: "11111111-1111-4111-8111-111111111111",
        email: `${role}@bishvil.test`,
      });
    },
  );

  it("keeps invalid request validation", async () => {
    const response = await signInPost(
      new Request("http://localhost/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_REQUEST" });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("keeps invalid credentials handling", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid"),
    });

    const response = await signInPost(signInRequest("host@bishvil.test"));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: "INVALID_CREDENTIALS",
    });
  });
});

function signInRequest(email: string) {
  return new Request("http://localhost/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
}
