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

type SessionStatus = "draft" | "scheduled" | "live" | "paused" | "ended";

async function seedSessionWithStatus(status: SessionStatus) {
  const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
  cleanupTargets.push({
    sessionId: fixtures.sessionId,
    questionId: fixtures.questionId,
    participantId: fixtures.participantId,
  });

  await sql`
    update public.sessions
    set status = ${status}::public.session_status
    where id = ${fixtures.sessionId}::uuid
  `;

  const [question] = await sql<{ ordinal: number }[]>`
    select ordinal from public.questions where id = ${fixtures.questionId}::uuid
  `;

  return { ...fixtures, ordinal: question?.ordinal ?? 1 };
}

async function getInfo(pin: string) {
  const { GET } = await import("@/app/api/quiz/[pin]/info/route");
  return GET(
    new Request(`http://localhost:3000/api/quiz/${pin}/info`) as Parameters<
      typeof GET
    >[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof GET>[1],
  );
}

async function getQuestion(pin: string, qIdx: number) {
  const { GET } = await import("@/app/api/quiz/[pin]/question/[qIdx]/route");
  return GET(
    new Request(`http://localhost:3000/api/quiz/${pin}/question/${qIdx}`) as Parameters<
      typeof GET
    >[0],
    { params: Promise.resolve({ pin, qIdx: String(qIdx) }) } as Parameters<
      typeof GET
    >[1],
  );
}

async function getCounts(pin: string, qIdx: number) {
  const { GET } = await import("@/app/api/quiz/[pin]/question/[qIdx]/counts/route");
  return GET(
    new Request(
      `http://localhost:3000/api/quiz/${pin}/question/${qIdx}/counts`,
    ) as Parameters<typeof GET>[0],
    { params: Promise.resolve({ pin, qIdx: String(qIdx) }) } as Parameters<
      typeof GET
    >[1],
  );
}

describe("public quiz route session status filtering", () => {
  for (const status of ["scheduled", "live", "ended"] as const) {
    it(`exposes public info and question metadata for ${status} sessions`, async () => {
      const fixtures = await seedSessionWithStatus(status);

      const info = await getInfo(fixtures.pin);
      expect(info.status).toBe(200);

      const question = await getQuestion(fixtures.pin, fixtures.ordinal);
      expect(question.status).toBe(200);

      const counts = await getCounts(fixtures.pin, fixtures.ordinal);
      expect(counts.status).not.toBe(404);
    });
  }

  // ADR-0007 §1.4: `paused` is a host-controlled mid-session freeze; the
  // public PIN-only API must treat it as if the session doesn't exist so
  // public payloads cannot refresh through the paused state. Participants
  // still observe paused via their authenticated participant route.
  it("hides paused sessions from every public quiz API route", async () => {
    const fixtures = await seedSessionWithStatus("paused");

    await expect(getInfo(fixtures.pin)).resolves.toHaveProperty("status", 404);
    await expect(getQuestion(fixtures.pin, fixtures.ordinal)).resolves.toHaveProperty(
      "status",
      404,
    );
    await expect(getCounts(fixtures.pin, fixtures.ordinal)).resolves.toHaveProperty(
      "status",
      404,
    );
  });

  it("hides draft sessions from every public quiz API route", async () => {
    const fixtures = await seedSessionWithStatus("draft");

    await expect(getInfo(fixtures.pin)).resolves.toHaveProperty("status", 404);
    await expect(getQuestion(fixtures.pin, fixtures.ordinal)).resolves.toHaveProperty(
      "status",
      404,
    );
    await expect(getCounts(fixtures.pin, fixtures.ordinal)).resolves.toHaveProperty(
      "status",
      404,
    );
  });
});
