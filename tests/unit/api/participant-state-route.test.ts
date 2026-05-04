import { afterAll, describe, expect, it, vi } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
} from "./test-db";

interface MockClaims {
  userId: string;
  role: "participant";
  sessionId: string;
  participantId: string;
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

async function callParticipantStateGet(
  pin: string,
  participantId: string,
  sessionId: string,
): Promise<{ status: number; body: unknown }> {
  currentClaims = {
    userId: participantId,
    role: "participant",
    sessionId,
    participantId,
  };

  const { GET } = await import("@/app/api/participant/[pin]/state/route");

  try {
    const response = await GET(
      new Request(`http://localhost:3000/api/participant/${pin}/state`, {
        method: "GET",
      }) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ pin }) } as Parameters<typeof GET>[1],
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    currentClaims = null;
  }
}

describe("GET /api/participant/[pin]/state", () => {
  it("keeps a submitted sync answer locked until reveal without leaking targets", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      update public.questions
      set type = 'map',
          options = null,
          correct_ids = null,
          map = ${sql.json({
            geo: {
              target: { lat: 31.5, lng: 34.9 },
              toleranceKm: 5,
            },
          })}
      where id = ${fixtures.questionId}::uuid
    `;
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
        'locked',
        now() - interval '1 minute',
        now() + interval '60 seconds'
      )
    `;
    await sql`
      insert into public.answers (
        session_id, question_id, participant_id, selected_ids, is_correct, score, time_bonus
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.questionId}::uuid,
        ${fixtures.participantId}::uuid,
        ARRAY['a']::text[],
        true,
        1500,
        0
      )
    `;

    const result = await callParticipantStateGet(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
    );

    expect(result.status).toBe(200);
    const body = result.body as {
      question: { status: string; map: unknown } | null;
      myAnswer: Record<string, unknown> | null;
      reveal: unknown;
    };
    expect(body.question?.status).toBe("locked");
    expect(body.question?.map).toEqual({
      geo: {
        center: undefined,
        zoom: undefined,
        toleranceKm: 5,
        styleHint: undefined,
      },
    });
    expect(body.myAnswer).toMatchObject({ status: "submitted_awaiting_reveal" });
    expect(body.myAnswer).not.toHaveProperty("isCorrect");
    expect(body.myAnswer).not.toHaveProperty("score");
    expect(body.reveal).toBeNull();
    expect(JSON.stringify(body)).not.toContain("correctIds");
    expect(JSON.stringify(body)).not.toContain("\"target\"");
  });

  it("omits malformed stored question JSON without failing participant state", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    // Malformation: lat outside the -90..90 range. Stored as JSON so the
    // db column accepts it; the application-level Zod validator rejects it.
    await sql`
      update public.questions
      set type = 'map',
          options = null,
          correct_ids = null,
          map = ${sql.json({
            geo: {
              target: { lat: 999, lng: 34.9 },
              toleranceKm: 5,
            },
          })}
      where id = ${fixtures.questionId}::uuid
    `;
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
        'answering',
        now(),
        now() + interval '60 seconds'
      )
    `;

    const result = await callParticipantStateGet(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
    );

    expect(result.status).toBe(200);
    const body = result.body as { question: unknown; reveal: unknown };
    expect(body.question).toBeNull();
    expect(body.reveal).toBeNull();
  });
});
