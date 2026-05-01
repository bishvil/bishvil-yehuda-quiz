import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createServiceRoleSupabaseClientMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
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

function uploadClient() {
  return {
    storage: {
      from: fromMock,
    },
  };
}

async function callLogo(request: Request) {
  const { POST } = await import("@/app/api/admin/uploads/logo/route");
  return POST(request as Parameters<typeof POST>[0]);
}

async function callQuestionImage(request: Request) {
  const { POST } = await import(
    "@/app/api/admin/uploads/question-image/route"
  );
  return POST(request as Parameters<typeof POST>[0]);
}

async function resetRateLimits() {
  const { resetUploadRateLimitsForTests } = await import(
    "@/app/api/admin/uploads/upload-handler"
  );
  resetUploadRateLimitsForTests();
}

function multipartRequest(file: File, url = "http://localhost/api/upload") {
  const formData = new FormData();
  formData.set("file", file);
  return {
    url,
    headers: new Headers(),
    formData: async () => formData,
  } as unknown as Request;
}

describe("admin upload routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRateLimits();
    requireRoleMock.mockResolvedValue(adminAuth());
    uploadMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation((bucket: string) => ({
      upload: uploadMock,
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `http://storage.local/${bucket}/${path}` },
      }),
    }));
    createServiceRoleSupabaseClientMock.mockResolvedValue(uploadClient());
  });

  it.each([
    ["logo", callLogo],
    ["question image", callQuestionImage],
  ] as const)("requires admin auth for the %s route", async (_label, callRoute) => {
    requireRoleMock.mockResolvedValue(unauthorizedAuth());

    const response = await callRoute(
      multipartRequest(new File(["x"], "logo.png", { type: "image/png" })),
    );

    expect(response.status).toBe(401);
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("uploads a logo to brand-logos with a UUID path and public URL", async () => {
    const response = await callLogo(
      multipartRequest(
        new File(["logo"], "לוגו אישי.png", { type: "image/png" }),
      ),
    );
    const body = (await response.json()) as { url: string; path: string };

    expect(response.status).toBe(201);
    expect(body.path).toMatch(
      /^22222222-2222-4222-8222-222222222222\/[0-9a-f-]+\.png$/,
    );
    expect(body.path).not.toContain("לוגו");
    expect(body.url).toBe(`http://storage.local/brand-logos/${body.path}`);
    expect(fromMock).toHaveBeenCalledWith("brand-logos");
    expect(uploadMock).toHaveBeenCalledWith(
      body.path,
      expect.any(Blob),
      expect.objectContaining({
        contentType: "image/png",
        upsert: false,
      }),
    );
  });

  it("uploads a question image to question-images", async () => {
    const response = await callQuestionImage(
      multipartRequest(
        new File(["image"], "תחנה.webp", { type: "image/webp" }),
      ),
    );
    const body = (await response.json()) as { url: string; path: string };

    expect(response.status).toBe(201);
    expect(body.path).toMatch(
      /^22222222-2222-4222-8222-222222222222\/[0-9a-f-]+\.webp$/,
    );
    expect(body.url).toBe(`http://storage.local/question-images/${body.path}`);
    expect(fromMock).toHaveBeenCalledWith("question-images");
  });

  it.each([
    ["logo", callLogo, 512 * 1024],
    ["question image", callQuestionImage, 2 * 1024 * 1024],
  ] as const)("rejects oversized %s requests by Content-Length", async (
    _label,
    callRoute,
    maxBytes,
  ) => {
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Length": String(maxBytes + 64 * 1024 + 1) },
      body: "too large",
    });

    const response = await callRoute(request);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(413);
    expect(body.error).toBe("FILE_TOO_LARGE");
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["logo", callLogo],
    ["question image", callQuestionImage],
  ] as const)("rejects unsupported MIME types for %s uploads", async (
    _label,
    callRoute,
  ) => {
    const response = await callRoute(
      multipartRequest(new File(["x"], "note.txt", { type: "text/plain" })),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("allows SVG for logos but rejects SVG for question images", async () => {
    const logoResponse = await callLogo(
      multipartRequest(new File(["<svg />"], "logo.svg", { type: "image/svg+xml" })),
    );
    const questionResponse = await callQuestionImage(
      multipartRequest(new File(["<svg />"], "map.svg", { type: "image/svg+xml" })),
    );

    expect(logoResponse.status).toBe(201);
    expect(questionResponse.status).toBe(415);
  });

  it.each([
    ["logo", callLogo],
    ["question image", callQuestionImage],
  ] as const)("rejects malformed multipart bodies for %s uploads", async (
    _label,
    callRoute,
  ) => {
    const response = await callRoute(
      {
        headers: new Headers(),
        formData: async () => {
          throw new Error("Malformed multipart body.");
        },
      } as unknown as Request,
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_REQUEST");
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });
});
