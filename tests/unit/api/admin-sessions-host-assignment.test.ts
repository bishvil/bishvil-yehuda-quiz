import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_HOST_ID = "33333333-3333-4333-8333-333333333333";
const PARTICIPANT_ID = "44444444-4444-4444-8444-444444444444";
const QUIZ_ID = "55555555-5555-4555-8555-555555555555";
const SESSION_ID = "66666666-6666-4666-8666-666666666666";

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

interface SessionInsertCapture {
  quiz_id?: string;
  host_id?: string;
  pin?: string;
  status?: string;
  game_mode?: string;
  auto_reveal?: boolean;
}

interface SupabaseStubOptions {
  quiz?: { default_game_mode: "sync" | "async"; archived_at: string | null };
  questionCount?: number;
  insertResult?: { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };
  existingSession?: {
    id: string;
    pin: string;
    quiz_id: string;
    status: "draft" | "scheduled" | "live" | "paused" | "ended";
    game_mode: "sync" | "async";
    auto_reveal: boolean;
    host_id: string | null;
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
  } | null;
  updateResult?: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
  capturedInsert?: SessionInsertCapture;
  capturedUpdate?: { host_id?: string };
  authUsers: Array<{ id: string; email: string; app_metadata: { role?: string } }>;
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
 * Stubs the supabase service-role client used by the sessions POST and
 * sessions/[id] PATCH routes. Each `from(table)` returns a chain that
 * matches what the route actually calls — quizzes lookup, questions
 * count, sessions insert/select/update — so the route runs end-to-end
 * with no live DB.
 */
function makeSupabase(opts: SupabaseStubOptions) {
  return {
    from: vi.fn((table: string) => {
      if (table === "quizzes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.quiz
                  ? { id: QUIZ_ID, ...opts.quiz }
                  : null,
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === "questions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              count: opts.questionCount ?? 0,
              error: null,
            })),
          })),
        };
      }

      if (table === "sessions") {
        return {
          insert: vi.fn((row: SessionInsertCapture) => {
            if (opts.capturedInsert) Object.assign(opts.capturedInsert, row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => opts.insertResult ?? { data: null, error: null }),
              })),
            };
          }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.existingSession ?? null,
                error: null,
              })),
            })),
          })),
          update: vi.fn((row: { host_id?: string }) => {
            if (opts.capturedUpdate) Object.assign(opts.capturedUpdate, row);
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => opts.updateResult ?? {
                    data: null,
                    error: null,
                  }),
                })),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: { users: opts.authUsers },
          error: null,
        })),
      },
    },
  };
}

const TEAM_USERS = [
  {
    id: ADMIN_ID,
    email: "admin@example.com",
    app_metadata: { role: "admin" },
  },
  {
    id: HOST_ID,
    email: "host@example.com",
    app_metadata: { role: "host" },
  },
  {
    id: SECOND_HOST_ID,
    email: "second@example.com",
    app_metadata: { role: "host" },
  },
  {
    id: PARTICIPANT_ID,
    email: "participant@example.com",
    app_metadata: { role: "participant" },
  },
];

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/admin/sessions/route");
  const request = new Request("http://localhost:3000/api/admin/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

async function callPatch(id: string, body: unknown) {
  const { PATCH } = await import("@/app/api/admin/sessions/[id]/route");
  const request = new Request(
    `http://localhost:3000/api/admin/sessions/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as unknown as Parameters<typeof PATCH>[0];
  const context = {
    params: Promise.resolve({ id }),
  } as Parameters<typeof PATCH>[1];
  const response = await PATCH(request, context);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/admin/sessions — host assignment [QA-26]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("assigns the explicit hostUserId when it belongs to a teammate", async () => {
    const captured: SessionInsertCapture = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        quiz: { default_game_mode: "sync", archived_at: null },
        questionCount: 1,
        capturedInsert: captured,
        insertResult: {
          data: {
            id: SESSION_ID,
            pin: "654321",
            quiz_id: QUIZ_ID,
            status: "scheduled",
            game_mode: "sync",
            auto_reveal: false,
            host_id: HOST_ID,
            ended_at: null,
            created_at: "2026-04-30T20:00:00Z",
          },
          error: null,
        },
        authUsers: TEAM_USERS,
      }),
    );

    const result = await callPost({ quizId: QUIZ_ID, hostUserId: HOST_ID });

    expect(result.status).toBe(201);
    expect(captured.host_id).toBe(HOST_ID);
    expect(result.body).toMatchObject({
      session: { hostId: HOST_ID, hostEmail: "host@example.com" },
    });
  });

  it("rejects hostUserId for a participant (400 INVALID_HOST)", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        quiz: { default_game_mode: "sync", archived_at: null },
        questionCount: 1,
        authUsers: TEAM_USERS,
      }),
    );

    const result = await callPost({
      quizId: QUIZ_ID,
      hostUserId: PARTICIPANT_ID,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: "INVALID_HOST" });
  });

  it("falls back to the current admin when no hostUserId is provided", async () => {
    const captured: SessionInsertCapture = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        quiz: { default_game_mode: "sync", archived_at: null },
        questionCount: 1,
        capturedInsert: captured,
        insertResult: {
          data: {
            id: SESSION_ID,
            pin: "111222",
            quiz_id: QUIZ_ID,
            status: "scheduled",
            game_mode: "sync",
            auto_reveal: false,
            host_id: ADMIN_ID,
            ended_at: null,
            created_at: "2026-04-30T20:00:00Z",
          },
          error: null,
        },
        authUsers: TEAM_USERS,
      }),
    );

    const result = await callPost({ quizId: QUIZ_ID });

    expect(result.status).toBe(201);
    expect(captured.host_id).toBe(ADMIN_ID);
    expect(result.body).toMatchObject({
      session: { hostId: ADMIN_ID, hostEmail: "admin@example.com" },
    });
  });
});

describe("PATCH /api/admin/sessions/[id] — host reassignment [QA-26]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("updates the host on a scheduled session", async () => {
    const captured: { host_id?: string } = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        existingSession: {
          id: SESSION_ID,
          pin: "654321",
          quiz_id: QUIZ_ID,
          status: "scheduled",
          game_mode: "sync",
          auto_reveal: false,
          host_id: ADMIN_ID,
          started_at: null,
          ended_at: null,
          created_at: "2026-04-30T20:00:00Z",
        },
        capturedUpdate: captured,
        updateResult: {
          data: {
            id: SESSION_ID,
            pin: "654321",
            quiz_id: QUIZ_ID,
            status: "scheduled",
            game_mode: "sync",
            auto_reveal: false,
            host_id: SECOND_HOST_ID,
            started_at: null,
            ended_at: null,
            created_at: "2026-04-30T20:00:00Z",
          },
          error: null,
        },
        authUsers: TEAM_USERS,
      }),
    );

    const result = await callPatch(SESSION_ID, { hostUserId: SECOND_HOST_ID });

    expect(result.status).toBe(200);
    expect(captured.host_id).toBe(SECOND_HOST_ID);
    expect(result.body).toMatchObject({
      session: { hostId: SECOND_HOST_ID, hostEmail: "second@example.com" },
    });
  });

  it("refuses to reassign once the session is live (409 INVALID_STATE)", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        existingSession: {
          id: SESSION_ID,
          pin: "654321",
          quiz_id: QUIZ_ID,
          status: "live",
          game_mode: "sync",
          auto_reveal: false,
          host_id: ADMIN_ID,
          started_at: "2026-04-30T20:00:00Z",
          ended_at: null,
          created_at: "2026-04-30T20:00:00Z",
        },
        authUsers: TEAM_USERS,
      }),
    );

    const result = await callPatch(SESSION_ID, { hostUserId: SECOND_HOST_ID });

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "INVALID_STATE" });
  });
});
