import { afterAll, describe, expect, it, vi } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedAdditionalQuestion,
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
  extraQuestionIds: string[];
}> = [];

afterAll(async () => {
  for (const target of cleanupTargets) {
    await cleanupFixtures(
      sql,
      target.sessionId,
      target.questionId,
      target.participantId,
    );
    for (const questionId of target.extraQuestionIds) {
      await sql`delete from public.questions where id = ${questionId}::uuid`;
    }
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
      request as Parameters<typeof POST>[0],
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

describe("POST /api/session/[pin]/answer concurrency", () => {
  it("keeps score and streak increments when two questions submit concurrently", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });
    const secondQuestion = await seedAdditionalQuestion(sql);
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
      extraQuestionIds: [secondQuestion.questionId],
    });

    await sql`
      insert into public.participant_question_progress (
        session_id, participant_id, question_id, question_index,
        status, started_at, deadline_at
      ) values
      (
        ${fixtures.sessionId}::uuid,
        ${fixtures.participantId}::uuid,
        ${fixtures.questionId}::uuid,
        1,
        'answering',
        now(),
        now() + interval '60 seconds'
      ),
      (
        ${fixtures.sessionId}::uuid,
        ${fixtures.participantId}::uuid,
        ${secondQuestion.questionId}::uuid,
        2,
        'answering',
        now(),
        now() + interval '60 seconds'
      )
    `;

    const [first, second] = await Promise.all([
      callAnswerPost(fixtures.pin, fixtures.participantId, fixtures.sessionId, {
        questionId: fixtures.questionId,
        selectedIds: ["a"],
      }),
      callAnswerPost(fixtures.pin, fixtures.participantId, fixtures.sessionId, {
        questionId: secondQuestion.questionId,
        selectedIds: ["a"],
      }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const answers = await sql<{ score: number; is_correct: boolean }[]>`
      select score, is_correct
      from public.answers
      where session_id = ${fixtures.sessionId}::uuid
        and participant_id = ${fixtures.participantId}::uuid
      order by submitted_at asc
    `;
    expect(answers).toHaveLength(2);

    const expectedScore = answers.reduce((sum, answer) => sum + answer.score, 0);
    expect(answers.every((answer) => answer.is_correct)).toBe(true);

    const [scoreRow] = await sql<{
      total_score: number;
      correct_count: number;
    }[]>`
      select total_score, correct_count
      from public.participant_scores
      where session_id = ${fixtures.sessionId}::uuid
        and participant_id = ${fixtures.participantId}::uuid
    `;

    expect(scoreRow?.total_score).toBe(expectedScore);
    expect(scoreRow?.correct_count).toBe(2);

    const [participant] = await sql<{ streak: number }[]>`
      select streak
      from public.session_participants
      where id = ${fixtures.participantId}::uuid
    `;
    expect(participant?.streak).toBe(2);
  });
});
