/**
 * Unit tests for DELETE /api/admin/sessions/[id] — B1 session lifecycle.
 *
 * Covers:
 *   - soft-archive succeeds for ended/draft/scheduled sessions
 *   - soft-archive of a live/paused session returns 409
 *   - hard-delete of an unarchived session returns 409 NOT_ARCHIVED
 *   - hard-delete of an archived ended session succeeds (cascade handled by DB)
 *   - hard-delete of an archived live session returns 409 INVALID_STATE
 *
 * Uses inline supabase stubs (same pattern as admin-sessions-host-assignment.test.ts).
 * FK cascade is a DB engine concern — tested via migration + integration path;
 * these unit tests verify the route guard logic only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
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

// Pull in team-lookup stubs to satisfy PATCH imports in the same route file.
vi.mock("@/src/lib/admin/team-lookup", () => ({
  fetchTeamUsers: vi.fn(async () => []),
  buildTeamUserMap: vi.fn(() => new Map()),
}));

type SessionStatus = "draft" | "scheduled" | "live" | "paused" | "ended";

interface SessionLookupRow {
  id: string;
  status: SessionStatus;
  archived_at: string | null;
}

interface SupabaseDeleteStubOptions {
  lookup: SessionLookupRow | null;
  lookupError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
  capturedUpdate?: Record<string, unknown>;
}

/**
 * Builds a minimal supabase stub shaped for the DELETE handler.
 * The route calls:
 *   - soft-archive: select(...).eq(id).maybeSingle() → update({...}).eq(id)
 *   - hard-delete: select(...).eq(id).maybeSingle() → delete().eq(id)
 */
function makeSupabase(opts: SupabaseDeleteStubOptions) {
  return {
    from: vi.fn((table: string) => {
      if (table !== "sessions") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: opts.lookup,
              error: opts.lookupError ?? null,
            })),
          })),
        })),
        update: vi.fn((row: Record<string, unknown>) => {
          if (opts.capturedUpdate) Object.assign(opts.capturedUpdate, row);
          return {
            eq: vi.fn(() =>
              Promise.resolve({ error: opts.updateError ?? null }),
            ),
          };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ error: opts.deleteError ?? null }),
          ),
        })),
      };
    }),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
  };
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

async function callDelete(id: string, hard = false) {
  const { DELETE } = await import("@/app/api/admin/sessions/[id]/route");
  const url = hard
    ? `http://localhost:3000/api/admin/sessions/${id}?hard=true`
    : `http://localhost:3000/api/admin/sessions/${id}`;
  const request = new Request(url, { method: "DELETE" }) as unknown as Parameters<
    typeof DELETE
  >[0];
  const context = { params: Promise.resolve({ id }) } as Parameters<
    typeof DELETE
  >[1];
  const response = await DELETE(request, context);
  return { status: response.status, body: await response.json() };
}

describe("DELETE /api/admin/sessions/[id] — soft-archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("archives an ended session and returns 200 with archivedAt", async () => {
    const captured: Record<string, unknown> = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "ended", archived_at: null },
        capturedUpdate: captured,
      }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "archived" });
    expect(typeof result.body.archivedAt).toBe("string");
    // Ended sessions should NOT have status changed.
    expect(captured.status).toBeUndefined();
    expect(captured.archived_at).toBeTruthy();
  });

  it("archives a scheduled session and also transitions status to ended", async () => {
    const captured: Record<string, unknown> = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "scheduled", archived_at: null },
        capturedUpdate: captured,
      }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "archived" });
    // PIN index requires scheduled → ended when archiving.
    expect(captured.status).toBe("ended");
    expect(captured.archived_at).toBeTruthy();
  });

  it("archives a draft session without changing status", async () => {
    const captured: Record<string, unknown> = {};
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "draft", archived_at: null },
        capturedUpdate: captured,
      }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "archived" });
    expect(captured.status).toBeUndefined();
  });

  it("returns 409 INVALID_STATE when archiving a live session", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "live", archived_at: null },
      }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "INVALID_STATE" });
  });

  it("returns 409 INVALID_STATE when archiving a paused session", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "paused", archived_at: null },
      }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "INVALID_STATE" });
  });

  it("returns 404 when the session does not exist", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({ lookup: null }),
    );

    const result = await callDelete(SESSION_ID);

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "NOT_FOUND" });
  });
});

describe("DELETE /api/admin/sessions/[id]?hard=true — hard-delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(adminAuth());
  });

  it("returns 409 NOT_ARCHIVED when attempting to hard-delete an unarchived session", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: { id: SESSION_ID, status: "ended", archived_at: null },
      }),
    );

    const result = await callDelete(SESSION_ID, true);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "NOT_ARCHIVED" });
  });

  it("hard-deletes an archived ended session and returns 200", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          id: SESSION_ID,
          status: "ended",
          archived_at: "2026-05-01T10:00:00Z",
        },
      }),
    );

    const result = await callDelete(SESSION_ID, true);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "deleted", id: SESSION_ID });
  });

  it("hard-deletes an archived draft session and returns 200", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          id: SESSION_ID,
          status: "draft",
          archived_at: "2026-05-01T10:00:00Z",
        },
      }),
    );

    const result = await callDelete(SESSION_ID, true);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "deleted", id: SESSION_ID });
  });

  it("returns 409 INVALID_STATE when hard-deleting an archived but live session", async () => {
    // Edge case: should not happen in normal flow, but guard is still tested.
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({
        lookup: {
          id: SESSION_ID,
          status: "live",
          archived_at: "2026-05-01T10:00:00Z",
        },
      }),
    );

    const result = await callDelete(SESSION_ID, true);

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "INVALID_STATE" });
  });

  it("returns 404 when the session does not exist", async () => {
    createServiceRoleSupabaseClientMock.mockResolvedValue(
      makeSupabase({ lookup: null }),
    );

    const result = await callDelete(SESSION_ID, true);

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "NOT_FOUND" });
  });
});
