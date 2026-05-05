import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createServiceRoleSupabaseClientMock = vi.hoisted(() => vi.fn());
const createSignedUploadUrlMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/auth/server-auth", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: createServiceRoleSupabaseClientMock,
}));

vi.mock("@/src/lib/logging", () => ({
  writeLog: vi.fn(),
}));

function adminAuth() {
  return {
    ok: true,
    claims: {
      userId: ADMIN_ID,
      role: "admin",
      sessionId: null,
      participantId: null,
    },
  };
}

function unauthorizedAuth() {
  return {
    ok: false,
    response: new Response(
      JSON.stringify({
        error: "UNAUTHORIZED",
        message: "Authentication required.",
      }),
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
  };
}

async function callSign(body: unknown) {
  const { POST } = await import("@/app/api/admin/uploads/sign/route");
  const request = {
    headers: new Headers(),
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
  return POST(request);
}

async function resetRateLimits() {
  const { resetRateLimitsForTests } = await import(
    "@/app/api/admin/uploads/rate-limit"
  );
  resetRateLimitsForTests();
}

describe("admin upload sign route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRateLimits();
    requireRoleMock.mockResolvedValue(adminAuth());
    createSignedUploadUrlMock.mockResolvedValue({
      data: { token: "signed-token", path: "ignored" },
      error: null,
    });
    fromMock.mockImplementation((bucket: string) => ({
      createSignedUploadUrl: createSignedUploadUrlMock,
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `http://storage.local/${bucket}/${path}` },
      }),
    }));
    createServiceRoleSupabaseClientMock.mockResolvedValue({
      storage: { from: fromMock },
    });
  });

  it("requires admin auth", async () => {
    requireRoleMock.mockResolvedValue(unauthorizedAuth());

    const response = await callSign({
      kind: "logo",
      mimeType: "image/png",
      size: 1024,
    });

    expect(response.status).toBe(401);
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("issues a logo signed URL with a UUID-prefixed path and bucket public URL", async () => {
    const response = await callSign({
      kind: "logo",
      mimeType: "image/png",
      size: 1024,
    });
    const body = (await response.json()) as {
      bucket: string;
      path: string;
      token: string;
      publicUrl: string;
      maxBytes: number;
    };

    expect(response.status).toBe(200);
    expect(body.bucket).toBe("brand-logos");
    expect(body.path).toMatch(
      /^22222222-2222-4222-8222-222222222222\/[0-9a-f-]+\.png$/,
    );
    expect(body.token).toBe("signed-token");
    expect(body.publicUrl).toBe(`http://storage.local/brand-logos/${body.path}`);
    expect(body.maxBytes).toBe(512 * 1024);
    expect(fromMock).toHaveBeenCalledWith("brand-logos");
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith(
      body.path,
      expect.objectContaining({ upsert: false }),
    );
  });

  it("issues a question-image signed URL with the right bucket", async () => {
    const response = await callSign({
      kind: "question-image",
      mimeType: "image/webp",
      size: 50_000,
    });
    const body = (await response.json()) as { bucket: string; path: string };

    expect(response.status).toBe(200);
    expect(body.bucket).toBe("question-images");
    expect(body.path).toMatch(/\.webp$/);
  });

  it("issues a question-video signed URL up to 25 MB", async () => {
    const response = await callSign({
      kind: "question-video",
      mimeType: "video/mp4",
      size: 25 * 1024 * 1024,
    });
    const body = (await response.json()) as {
      bucket: string;
      path: string;
      maxBytes: number;
    };

    expect(response.status).toBe(200);
    expect(body.bucket).toBe("question-videos");
    expect(body.path).toMatch(/\.mp4$/);
    expect(body.maxBytes).toBe(25 * 1024 * 1024);
  });

  it("rejects an unknown kind", async () => {
    const response = await callSign({
      kind: "secret",
      mimeType: "image/png",
      size: 100,
    });

    expect(response.status).toBe(400);
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported MIME for question images", async () => {
    const response = await callSign({
      kind: "question-image",
      mimeType: "image/svg+xml",
      size: 100,
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("allows SVG for logos but rejects SVG for question images", async () => {
    const logo = await callSign({
      kind: "logo",
      mimeType: "image/svg+xml",
      size: 1024,
    });
    const question = await callSign({
      kind: "question-image",
      mimeType: "image/svg+xml",
      size: 1024,
    });

    expect(logo.status).toBe(200);
    expect(question.status).toBe(415);
  });

  it("rejects oversized files with 413 before signing", async () => {
    const response = await callSign({
      kind: "question-image",
      mimeType: "image/png",
      size: 2 * 1024 * 1024 + 1,
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(413);
    expect(body.error).toBe("FILE_TOO_LARGE");
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies", async () => {
    const { POST } = await import("@/app/api/admin/uploads/sign/route");
    const request = {
      headers: new Headers(),
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_REQUEST");
  });

  it("returns 500 when Supabase signing itself fails", async () => {
    createSignedUploadUrlMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });

    const response = await callSign({
      kind: "logo",
      mimeType: "image/png",
      size: 1024,
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe("SIGN_FAILED");
  });
});
