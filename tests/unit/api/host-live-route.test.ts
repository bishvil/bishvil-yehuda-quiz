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

async function callLiveGet(pin: string): Promise<{
  status: number;
  cacheControl: string | null;
  body: Record<string, unknown>;
}> {
  const { GET } = await import("@/app/api/host/[pin]/live/route");
  const response = await GET(
    new Request(`http://localhost:3000/api/host/${pin}/live`) as Parameters<
      typeof GET
    >[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof GET>[1],
  );
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("GET /api/host/[pin]/live", () => {
  it("emits private,no-store cache header and base shape", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);

    const result = await callLiveGet(fixtures.pin);
    expect(result.status).toBe(200);
    expect(result.cacheControl).toMatch(/private/);
    expect(result.cacheControl).toMatch(/no-store/);
    expect(result.body).toMatchObject({
      sessionId: fixtures.sessionId,
      gameMode: "sync",
      totalQuestions: expect.any(Number),
      players: expect.any(Array),
    });
  });

  it("does not leak correct_ids or map.target before reveal", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);

    // Mark the question as the session's current question and put it in
    // `answering` state so the live route surfaces it. This mirrors what
    // /question/start does in production.
    await sql`
      update public.sessions
      set current_question_id = ${fixtures.questionId}::uuid
      where id = ${fixtures.sessionId}::uuid
    `;
    await sql`
      insert into public.question_session_state (
        session_id, question_id, question_index, status, started_at, deadline_at
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'answering'::public.question_status,
        now(),
        now() + interval '60 seconds'
      )
    `;

    const result = await callLiveGet(fixtures.pin);
    expect(result.status).toBe(200);
    const body = result.body;
    expect(body.reveal).toBeNull();

    const question = body.question as Record<string, unknown> | null;
    expect(question).not.toBeNull();
    if (!question) throw new Error("expected question");

    // Options should never carry correct flags.
    const options = question.options as Array<Record<string, unknown>> | null;
    expect(Array.isArray(options)).toBe(true);
    for (const option of options ?? []) {
      expect(Object.keys(option)).not.toContain("correct");
      expect(Object.keys(option)).not.toContain("is_correct");
    }
    // Map (when present) carries only the geo block minus `target`.
    if (question.map) {
      const map = question.map as { geo?: Record<string, unknown> };
      expect(Object.keys(map.geo ?? {})).not.toContain("target");
    }

    // Top-level shape must not leak correct_ids either.
    expect(Object.keys(body)).not.toContain("correctIds");
  });

  it("populates reveal payload when question status is revealed", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);

    await sql`
      update public.sessions
      set current_question_id = ${fixtures.questionId}::uuid
      where id = ${fixtures.sessionId}::uuid
    `;
    await sql`
      insert into public.question_session_state (
        session_id, question_id, question_index, status, started_at, deadline_at, revealed_at
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'revealed'::public.question_status,
        now() - interval '90 seconds',
        now() - interval '30 seconds',
        now() - interval '5 seconds'
      )
    `;

    const result = await callLiveGet(fixtures.pin);
    expect(result.status).toBe(200);
    const reveal = result.body.reveal as Record<string, unknown> | null;
    expect(reveal).not.toBeNull();
    if (!reveal) throw new Error("expected reveal");
    expect(Array.isArray(reveal.correctIds)).toBe(true);
  });
});
