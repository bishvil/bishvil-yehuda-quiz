import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

const requireRoleMock = vi.hoisted(() => vi.fn());
const createServiceRoleSupabaseClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/lib/auth/server-auth", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/src/lib/supabase/server", () => ({
  createServiceRoleSupabaseClient: createServiceRoleSupabaseClientMock,
}));

vi.mock("@/src/lib/logging", () => ({
  writeLog: vi.fn(),
}));

interface LookupRow {
  id: string;
  archived_at: string | null;
  sessions: Array<{ count: number }>;
}

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

/**
 * Stubs the supabase client chain used by the DELETE handler. The route
 * issues either a `select(...).eq(id).maybeSingle()` (lookup) or a
 * `delete().eq(id)` (hard-delete) — both keyed off `from("quizzes")`. For
 * the soft-archive branch it issues `update({...}).eq(id).select(...).
 * maybeSingle()`. We keep the chain minimal: each shaped call returns the
 * scripted result, anything else throws so a future regression surfaces.
 */
function makeSupabase(opts: {
  lookup?: { data: LookupRow | null; error: { message: string } | null };
  delete?: { error: { message: string } | null };
  update?: {
    data: { id: string } | null;
    error: { message: string } | null;
  };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "quizzes") {
        throw new Error(`Unexpected table ${table}`);
      }
      return {
        // .select(...).eq(id).maybeSingle() — used by both hard-delete lookup
        // and the post-update soft-archive read.
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => opts.lookup ?? { data: null, error: null }),
          })),
        })),
        // .delete().eq(id)
        delete: vi.fn(() => ({
          eq: vi.fn(async () => opts.delete ?? { error: null }),
        })),
        // .update({...}).eq(id).select(...).maybeSingle()
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(
                async () => opts.update ?? { data: null, error: null },
              ),
            })),
          })),
        })),
      };
    }),
  };
}

async function callDelete(
  id: string,
  hard: boolean,
): Promise<{ status: number; body: unknown }> {
  const { DELETE } = await import("@/app/api/admin/quizzes/[id]/route");
  const url = hard
    ? `http://localhost:3000/api/admin/quizzes/${id}?hard=true`
    : `http://localhost:3000/api/admin/quizzes/${id}`;
  const request = new Request(url, {
    method: "DELETE",
  }) as unknown as Parameters<typeof DELETE>[0];
  const context = {
    params: Promise.resolve({ id }),
  } as Parameters<typeof DELETE>[1];
  const response = await DELETE(request, context);
  return { status: response.status, body: await response.json() };
}

const QUIZ_ID = "33333333-3333-4333-8333-333333333333";

describe("DELETE /api/admin/quizzes/[id]?hard=true [QA-21]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("rejects hard delete when quiz is not archived (409 NOT_ARCHIVED)", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          data: { id: QUIZ_ID, archived_at: null, sessions: [{ count: 0 }] },
          error: null,
        },
      }),
    );

    const result = await callDelete(QUIZ_ID, true);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "NOT_ARCHIVED" });
  });

  it("rejects hard delete when archived quiz has sessions (409 HAS_SESSIONS with count)", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          data: {
            id: QUIZ_ID,
            archived_at: "2026-04-30T20:00:00Z",
            sessions: [{ count: 3 }],
          },
          error: null,
        },
      }),
    );

    const result = await callDelete(QUIZ_ID, true);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: "HAS_SESSIONS",
      sessionCount: 3,
    });
  });

  it("hard-deletes archived quiz with zero sessions", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          data: {
            id: QUIZ_ID,
            archived_at: "2026-04-30T20:00:00Z",
            sessions: [{ count: 0 }],
          },
          error: null,
        },
        delete: { error: null },
      }),
    );

    const result = await callDelete(QUIZ_ID, true);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "deleted", id: QUIZ_ID });
  });

  it("returns 404 when the quiz does not exist", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { data: null, error: null },
      }),
    );

    const result = await callDelete(
      "00000000-0000-4000-8000-000000000000",
      true,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "QUIZ_NOT_FOUND" });
  });

  it("default DELETE (no ?hard) soft-archives", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        update: { data: { id: QUIZ_ID }, error: null },
      }),
    );

    const result = await callDelete(QUIZ_ID, false);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "archived" });
  });
});
