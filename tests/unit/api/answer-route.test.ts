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

async function callAnswerPost(
  pin: string,
  participantId: string,
  sessionId: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  currentClaims = {
    userId: participantId,
    role: "participant",
    sessionId,
    participantId,
  };

  const { POST } = await import("@/app/api/session/[pin]/answer/route");

  try {
    const request = new Request(`http://localhost:3000/api/session/${pin}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(
      request as unknown as Parameters<typeof POST>[0],
      {
        params: Promise.resolve({ pin }),
      } as Parameters<typeof POST>[1],
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    currentClaims = null;
  }
}

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

describe("POST /api/session/[pin]/answer", () => {
  it("rejects an answer submitted past the deadline (LATE_SUBMISSION)", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      insert into public.question_session_state (
        session_id, question_id, question_index, status, started_at, deadline_at
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'answering',
        now() - interval '1 minute',
        now() - interval '10 seconds'
      )
    `;

    const result = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, selectedIds: ["a"] },
    );

    expect(result.status).toBe(409);
    const body = result.body as { error: string };
    expect(body.error).toBe("LATE_SUBMISSION");
  });

  it("returns the existing row idempotently on duplicate submit (ADR-0006 §4)", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      insert into public.participant_question_progress (
        session_id, participant_id, question_id, question_index,
        status, started_at, deadline_at
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.participantId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'answering',
        now(),
        now() + interval '60 seconds'
      )
    `;

    const first = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, selectedIds: ["a"] },
    );
    expect(first.status).toBe(200);
    const firstBody = first.body as {
      status: string;
      submittedAt: string;
      score: number;
      isCorrect: boolean;
    };
    expect(firstBody.status).toBe("submitted");
    expect(firstBody.isCorrect).toBe(true);
    expect(firstBody.score).toBeGreaterThan(0);

    const second = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, selectedIds: ["b"] },
    );
    expect(second.status).toBe(200);
    const secondBody = second.body as {
      status: string;
      submittedAt: string;
      score: number;
    };
    expect(secondBody.status).toBe("already_submitted");
    expect(secondBody.submittedAt).toBe(firstBody.submittedAt);
  });

  it("omits reveal-only fields from sync pre-reveal submissions", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

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

    const result = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, selectedIds: ["a"] },
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.status).toBe("submitted");
    expect(body.submittedAt).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("isCorrect");
    expect(body).not.toHaveProperty("score");
    expect(body).not.toHaveProperty("timeBonus");
    expect(body).not.toHaveProperty("correctIds");
    expect(body).not.toHaveProperty("explanation");
  });

  it("persists async progress as revealed after submit", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      insert into public.participant_question_progress (
        session_id, participant_id, question_id, question_index,
        status, started_at, deadline_at
      ) values (
        ${fixtures.sessionId}::uuid,
        ${fixtures.participantId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'answering',
        now(),
        now() + interval '60 seconds'
      )
    `;

    const submitted = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, selectedIds: ["a"] },
    );

    expect(submitted.status).toBe(200);

    const state = await callParticipantStateGet(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
    );

    expect(state.status).toBe(200);
    const body = state.body as {
      myAnswer: { status: string; isCorrect: boolean } | null;
      reveal: { correctIds: string[] | null } | null;
    };
    expect(body.myAnswer?.status).toBe("revealed");
    expect(body.myAnswer?.isCorrect).toBe(true);
    expect(body.reveal?.correctIds).toEqual(["a"]);
  });

  it("returns a structured 500 before scoring malformed stored map JSON", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    // Malformation: lat outside the -90..90 range. Stored as JSON so the
    // db column accepts it; the application-level Zod validator rejects
    // it at scoring time.
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

    const result = await callAnswerPost(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
      { questionId: fixtures.questionId, pin: { lat: 31.5, lng: 34.9 } },
    );

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({
      error: "STORED_QUESTION_INVALID",
    });
  });
});
