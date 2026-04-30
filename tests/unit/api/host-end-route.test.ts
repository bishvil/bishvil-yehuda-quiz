import { afterAll, describe, expect, it, vi } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
  SEED_HOST_ID,
} from "./test-db";

vi.mock("@/src/lib/auth/server-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/auth/server-auth")
  >("@/src/lib/auth/server-auth");
  return {
    ...actual,
    requireRole: vi.fn(async () => ({
      ok: true,
      claims: {
        userId: SEED_HOST_ID,
        role: "host",
        sessionId: null,
        participantId: null,
      },
    })),
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

async function callEndPost(pin: string): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/host/[pin]/end/route");
  const response = await POST(
    new Request(`http://localhost:3000/api/host/${pin}/end`, {
      method: "POST",
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof POST>[1],
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/host/[pin]/end", () => {
  it("allows a host to cancel a scheduled session before start (ADR-0009)", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      update public.sessions
      set status = 'scheduled',
          current_question_id = null
      where id = ${fixtures.sessionId}::uuid
    `;

    const result = await callEndPost(fixtures.pin);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      sessionId: fixtures.sessionId,
      status: "ended",
    });

    const [session] = await sql<{ status: string; ended_at: string | null }[]>`
      select status, ended_at
      from public.sessions
      where id = ${fixtures.sessionId}::uuid
    `;
    expect(session?.status).toBe("ended");
    expect(session?.ended_at).not.toBeNull();
  });
});
