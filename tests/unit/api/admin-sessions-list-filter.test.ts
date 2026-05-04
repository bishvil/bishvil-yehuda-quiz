/**
 * Unit tests for GET /api/admin/sessions — B1 archived filter.
 *
 * Covers:
 *   - list excludes archived sessions by default (archived_at IS NOT NULL)
 *   - list includes archived sessions when ?includeArchived=1
 *
 * Uses inline supabase stubs (same pattern as admin-sessions-delete.test.ts).
 * The stub captures filter calls to verify the `.is("archived_at", null)` guard.
 */
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

vi.mock("@/src/lib/admin/team-lookup", () => ({
  fetchTeamUsers: vi.fn(async () => []),
  buildTeamUserMap: vi.fn(() => new Map()),
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

interface SessionRow {
  id: string;
  pin: string;
  quiz_id: string;
  status: string;
  game_mode: string;
  auto_reveal: boolean;
  host_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  archived_at: string | null;
}

const ACTIVE_SESSION: SessionRow = {
  id: "aaaa-active",
  pin: "111111",
  quiz_id: "quiz-1",
  status: "ended",
  game_mode: "sync",
  auto_reveal: false,
  host_id: null,
  started_at: null,
  ended_at: null,
  created_at: "2026-05-01T10:00:00Z",
  archived_at: null,
};

const ARCHIVED_SESSION: SessionRow = {
  id: "bbbb-archived",
  pin: "222222",
  quiz_id: "quiz-1",
  status: "ended",
  game_mode: "sync",
  auto_reveal: false,
  host_id: null,
  started_at: null,
  ended_at: null,
  created_at: "2026-04-30T10:00:00Z",
  archived_at: "2026-05-02T10:00:00Z",
};

/**
 * Builds a supabase stub that returns all sessions OR filters them.
 * The stub records which `.is(...)` call was made so we can assert on it.
 */
function makeSupabase(rows: SessionRow[]) {
  const calls: Array<{ method: string; col: string; value: unknown }> = [];

  const chain = {
    _rows: rows,
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn((col: string, value: unknown) => {
      calls.push({ method: "is", col, value });
      // Filter the rows to simulate archived_at IS NULL
      if (col === "archived_at" && value === null) {
        chain._rows = rows.filter((r) => r.archived_at === null);
      }
      return chain;
    }),
    then: (resolve: (value: { data: SessionRow[]; error: null }) => void) => {
      resolve({ data: chain._rows, error: null });
    },
  };

  // Make the chain thenable so `await query` works.
  Object.defineProperty(chain, Symbol.toStringTag, { value: "Promise" });

  return {
    calls,
    supabase: {
      from: vi.fn(() => chain),
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        },
      },
    },
  };
}

async function callGet(url: string) {
  const { GET } = await import("@/app/api/admin/sessions/route");
  const request = new Request(url) as unknown as Parameters<typeof GET>[0];
  const response = await GET(request);
  return { status: response.status, body: (await response.json()) as { sessions: SessionRow[] } };
}

describe("GET /api/admin/sessions — archived filter (B1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("excludes archived sessions by default (no ?includeArchived param)", async () => {
    const { supabase } = makeSupabase([ACTIVE_SESSION, ARCHIVED_SESSION]);
    createServiceRoleSupabaseClientMock.mockResolvedValue(supabase);

    const result = await callGet("http://localhost:3000/api/admin/sessions");

    expect(result.status).toBe(200);
    const ids = result.body.sessions.map((s) => s.id);
    expect(ids).toContain(ACTIVE_SESSION.id);
    expect(ids).not.toContain(ARCHIVED_SESSION.id);
  });

  it("includes archived sessions when ?includeArchived=1", async () => {
    const { supabase, calls } = makeSupabase([ACTIVE_SESSION, ARCHIVED_SESSION]);
    createServiceRoleSupabaseClientMock.mockResolvedValue(supabase);

    const result = await callGet(
      "http://localhost:3000/api/admin/sessions?includeArchived=1",
    );

    expect(result.status).toBe(200);
    const ids = result.body.sessions.map((s) => s.id);
    expect(ids).toContain(ACTIVE_SESSION.id);
    expect(ids).toContain(ARCHIVED_SESSION.id);
    // Verify the .is("archived_at", null) filter was NOT applied.
    const archivedFilter = calls.find((c) => c.col === "archived_at");
    expect(archivedFilter).toBeUndefined();
  });
});
