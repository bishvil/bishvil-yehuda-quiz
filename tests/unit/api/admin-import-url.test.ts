import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for POST /api/admin/uploads/import-url.
 *
 * Mocks: requireRole, createServiceRoleSupabaseClient, writeLog, and global
 * fetch. Does NOT make real network calls.
 */

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

// --- hoisted mocks -------------------------------------------------------

const requireRoleMock = vi.hoisted(() => vi.fn());
const createServiceRoleSupabaseClientMock = vi.hoisted(() => vi.fn());
const uploadMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/auth/server-auth", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: createServiceRoleSupabaseClientMock,
}));

vi.mock("@/src/lib/logging", () => ({
  writeLog: vi.fn(),
}));

// --- helpers -------------------------------------------------------------

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

function supabaseClient() {
  return {
    storage: {
      from: fromMock,
    },
  };
}

function makeFetchResponse(options: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentLength?: number | null;
  body?: Uint8Array | string | null;
}): Response {
  const {
    ok = true,
    status = 200,
    contentType = "image/jpeg",
    contentLength = null,
    body = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), // minimal JPEG magic
  } = options;

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  if (contentLength !== null) headers.set("content-length", String(contentLength));

  let readableBody: ReadableStream<Uint8Array> | null = null;
  if (body !== null) {
    const bytes =
      typeof body === "string" ? new TextEncoder().encode(body) : body;
    readableBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  return {
    ok,
    status,
    headers,
    body: readableBody,
  } as unknown as Response;
}

async function callImportUrl(bodyPayload: unknown) {
  // Reset module registry so each test gets a fresh module with fresh state.
  const { POST } = await import(
    "@/app/api/admin/uploads/import-url/route"
  );
  const request = new Request("http://localhost/api/admin/uploads/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });
  return POST(request);
}

async function resetRateLimits() {
  const { resetRateLimitsForTests } = await import(
    "@/app/api/admin/uploads/rate-limit"
  );
  resetRateLimitsForTests();
}

// --- tests ---------------------------------------------------------------

describe("POST /api/admin/uploads/import-url", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetRateLimits();

    requireRoleMock.mockResolvedValue(adminAuth());
    uploadMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation((bucket: string) => ({
      upload: uploadMock,
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://cdn.example.com/${bucket}/${path}` },
      }),
    }));
    createServiceRoleSupabaseClientMock.mockResolvedValue(supabaseClient());

    // Default: a successful HEAD then GET for a small JPEG.
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({
            contentType: "image/jpeg",
            contentLength: 1024,
            body: null,
          }),
        );
      }
      // GET
      return Promise.resolve(
        makeFetchResponse({
          contentType: "image/jpeg",
          body: new Uint8Array(1024).fill(0xab),
        }),
      );
    });
  });

  // ---- auth ------------------------------------------------------------

  it("returns 401 when not authenticated", async () => {
    requireRoleMock.mockResolvedValue({
      ok: false,
      response: new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Authentication required." }),
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      ),
    });

    const res = await callImportUrl({ url: "https://example.com/img.jpg" });
    expect(res.status).toBe(401);
    expect(createServiceRoleSupabaseClientMock).not.toHaveBeenCalled();
  });

  // ---- SSRF / pre-network validation -----------------------------------

  it("rejects non-https URL (http)", async () => {
    const res = await callImportUrl({ url: "http://example.com/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects data: URL", async () => {
    const res = await callImportUrl({
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
    });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects localhost", async () => {
    const res = await callImportUrl({ url: "https://localhost/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects subdomain of localhost", async () => {
    const res = await callImportUrl({ url: "https://anything.localhost/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private IPv4 10.0.0.5", async () => {
    const res = await callImportUrl({ url: "https://10.0.0.5/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private IPv4 192.168.1.100", async () => {
    const res = await callImportUrl({ url: "https://192.168.1.100/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects private IPv4 172.20.1.1 (172.16/12 range)", async () => {
    const res = await callImportUrl({ url: "https://172.20.1.1/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects loopback 127.0.0.1", async () => {
    const res = await callImportUrl({ url: "https://127.0.0.1/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(422);
    expect(body.error).toBe("SSRF_BLOCKED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects userinfo bypass https://x@10.0.0.1/", async () => {
    const res = await callImportUrl({ url: "https://x@10.0.0.1/img.jpg" });
    const body = (await res.json()) as { error: string };
    // username present → INVALID_REQUEST (rejected before IP check fires)
    expect([400, 422]).toContain(res.status);
    expect(["INVALID_REQUEST", "SSRF_BLOCKED"]).toContain(body.error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- HEAD rejects oversized ------------------------------------------

  it("rejects when HEAD content-length exceeds the cap", async () => {
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({
            contentType: "image/jpeg",
            contentLength: 3 * 1024 * 1024, // 3 MB > 2 MB cap
            body: null,
          }),
        );
      }
      return Promise.resolve(makeFetchResponse({ body: new Uint8Array(0) }));
    });

    const res = await callImportUrl({ url: "https://example.com/big.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(413);
    expect(body.error).toBe("FILE_TOO_LARGE");
  });

  // ---- streaming GET byte cap ------------------------------------------

  it("rejects oversized response via streaming GET even when HEAD is absent/small", async () => {
    // HEAD returns no content-length (so we fall through to GET).
    // GET streams multiple chunks whose total exceeds the 2 MB cap.
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({ contentType: "image/jpeg", contentLength: null, body: null }),
        );
      }

      // Build a ReadableStream that emits two chunks summing to 2.1 MB.
      const chunk1 = new Uint8Array(1024 * 1024 + 1).fill(0xab); // 1 MB + 1
      const chunk2 = new Uint8Array(1024 * 1024 + 1).fill(0xcd); // 1 MB + 1
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg" }),
        body: stream,
      } as unknown as Response);
    });

    const res = await callImportUrl({ url: "https://example.com/huge.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(413);
    expect(body.error).toBe("FILE_TOO_LARGE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // ---- wrong MIME type -------------------------------------------------

  it("rejects wrong MIME type (text/html) from GET", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({ contentType: "text/html", contentLength: 512, body: null }),
        );
      }
      return Promise.resolve(
        makeFetchResponse({ contentType: "text/html", body: new Uint8Array(512).fill(0x3c) }),
      );
    });

    const res = await callImportUrl({ url: "https://example.com/page.html" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // ---- happy path -------------------------------------------------------

  it("returns 201 with mirrored URL and path rooted at admin user id", async () => {
    const res = await callImportUrl({ url: "https://commons.wikimedia.org/sample.jpg" });
    const body = (await res.json()) as { url: string; path: string };

    expect(res.status).toBe(201);
    expect(body.path).toMatch(
      new RegExp(`^${ADMIN_ID}/[0-9a-f-]+\\.jpg$`),
    );
    expect(body.url).toContain("question-images");
    expect(uploadMock).toHaveBeenCalledWith(
      body.path,
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
  });

  it("uploads PNG when server returns image/png", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({ contentType: "image/png", contentLength: 512, body: null }),
        );
      }
      return Promise.resolve(
        makeFetchResponse({ contentType: "image/png", body: new Uint8Array(512).fill(0x89) }),
      );
    });

    const res = await callImportUrl({ url: "https://example.com/image.png" });
    const body = (await res.json()) as { path: string };
    expect(res.status).toBe(201);
    expect(body.path).toMatch(/\.png$/);
  });

  it("rejects SVG even if server claims image/svg+xml", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.resolve(
          makeFetchResponse({ contentType: "image/svg+xml", contentLength: 200, body: null }),
        );
      }
      return Promise.resolve(
        makeFetchResponse({ contentType: "image/svg+xml", body: new Uint8Array(200).fill(0x3c) }),
      );
    });

    const res = await callImportUrl({ url: "https://example.com/icon.svg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("falls through to GET when HEAD fails", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return Promise.reject(new Error("HEAD not supported"));
      }
      return Promise.resolve(
        makeFetchResponse({ contentType: "image/webp", body: new Uint8Array(512).fill(0xab) }),
      );
    });

    const res = await callImportUrl({ url: "https://example.com/photo.webp" });
    const body = (await res.json()) as { path: string };
    expect(res.status).toBe(201);
    expect(body.path).toMatch(/\.webp$/);
  });

  it("returns 502 when the external server is unreachable", async () => {
    fetchMock.mockImplementation(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    );

    const res = await callImportUrl({ url: "https://unreachable.example.com/img.jpg" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(502);
    expect(body.error).toBe("FETCH_FAILED");
  });

  it("returns 400 for missing url field", async () => {
    const res = await callImportUrl({ notUrl: "oops" });
    const body = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_REQUEST");
  });
});

// ---- httpsUrlSchema regression test ------------------------------------

describe("adminQuestionCreateSchema imageUrl validation", () => {
  it("rejects a non-https imageUrl", async () => {
    const { adminQuestionCreateSchema } = await import(
      "@/src/lib/admin/validation"
    );
    const result = adminQuestionCreateSchema.safeParse({
      ordinal: 1,
      type: "single",
      prompt: "מה זה?",
      imageUrl: "http://example.com/img.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a data: imageUrl", async () => {
    const { adminQuestionCreateSchema } = await import(
      "@/src/lib/admin/validation"
    );
    const result = adminQuestionCreateSchema.safeParse({
      ordinal: 1,
      type: "single",
      prompt: "מה זה?",
      imageUrl: "data:image/png;base64,abc",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid https imageUrl", async () => {
    const { adminQuestionCreateSchema } = await import(
      "@/src/lib/admin/validation"
    );
    const result = adminQuestionCreateSchema.safeParse({
      ordinal: 1,
      type: "single",
      prompt: "מה זה?",
      imageUrl: "https://cdn.example.com/img.jpg",
    });
    // Should parse successfully (imageUrl is valid https)
    expect(result.success).toBe(true);
  });
});
