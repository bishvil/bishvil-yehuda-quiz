import { afterAll, describe, expect, it } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
} from "./test-db";

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

async function callPublicQuestionGet(pin: string, qIdx: string) {
  const { GET } = await import("@/app/api/quiz/[pin]/question/[qIdx]/route");
  const response = await GET(
    new Request(`http://localhost:3000/api/quiz/${pin}/question/${qIdx}`) as Parameters<
      typeof GET
    >[0],
    { params: Promise.resolve({ pin, qIdx }) } as Parameters<typeof GET>[1],
  );

  return { status: response.status, body: await response.json() };
}

describe("GET /api/quiz/[pin]/question/[qIdx]", () => {
  it("omits malformed stored question JSON from public payloads", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push({
      sessionId: fixtures.sessionId,
      questionId: fixtures.questionId,
      participantId: fixtures.participantId,
    });

    await sql`
      update public.questions
      set options = ${sql.json([{ id: "a" }])}
      where id = ${fixtures.questionId}::uuid
    `;
    const [question] = await sql<{ ordinal: number }[]>`
      select ordinal from public.questions where id = ${fixtures.questionId}::uuid
    `;

    const result = await callPublicQuestionGet(
      fixtures.pin,
      String(question?.ordinal ?? 1),
    );

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "QUESTION_NOT_FOUND" });
  });
});
