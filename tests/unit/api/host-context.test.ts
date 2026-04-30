import { afterAll, describe, expect, it, vi } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
} from "./test-db";

interface MockClaims {
  userId: string;
  role: "host";
  sessionId: string | null;
  participantId: string | null;
}

let currentClaims: MockClaims | null = null;

vi.mock("@/src/lib/auth/server-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/auth/server-auth")
  >("@/src/lib/auth/server-auth");
  return {
    ...actual,
    requireRole: vi.fn(async () => {
      if (!currentClaims) {
        return {
          ok: false,
          response: actual.unauthorizedJson("Test claims not set."),
        };
      }
      return { ok: true, claims: currentClaims };
    }),
  };
});

const sql = getTestPostgres();
const cleanupTargets: Array<{
  sessionId: string;
  questionId: string;
  participantId: string;
}> = [];

afterAll(async () => {
  for (const target of cleanupTargets) {
    await cleanupFixtures(
      sql,
      target.sessionId,
      target.questionId,
      target.participantId,
    );
  }
  await sql.end();
});

async function callHostEnd(
  pin: string,
  hostId: string,
): Promise<{ status: number; body: unknown }> {
  currentClaims = {
    userId: hostId,
    role: "host",
    sessionId: null,
    participantId: null,
  };

  const { POST } = await import("@/app/api/host/[pin]/end/route");

  try {
    const response = await POST(
      new Request(`http://localhost:3000/api/host/${pin}/end`, {
        method: "POST",
      }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ pin }) } as Parameters<typeof POST>[1],
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    currentClaims = null;
  }
}

describe("host route ownership", () => {
  it("rejects host tokens for hostless sessions", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);

    await sql`
      update public.sessions
      set host_id = null
      where id = ${fixtures.sessionId}::uuid
    `;

    const result = await callHostEnd(fixtures.pin, fixtures.participantId);

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "FORBIDDEN" });

    const [session] = await sql<{ status: string }[]>`
      select status from public.sessions where id = ${fixtures.sessionId}::uuid
    `;
    expect(session?.status).toBe("live");
  });

  it("rejects host tokens when host_id belongs to a different user", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);

    const result = await callHostEnd(fixtures.pin, fixtures.participantId);

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "FORBIDDEN" });

    const [session] = await sql<{ status: string }[]>`
      select status from public.sessions where id = ${fixtures.sessionId}::uuid
    `;
    expect(session?.status).toBe("live");
  });

  it("rejects host controls for async sessions", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });
    cleanupTargets.push(fixtures);

    const result = await callHostEnd(fixtures.pin, "11111111-1111-4111-8111-111111111111");

    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ error: "FORBIDDEN" });
  });
});
