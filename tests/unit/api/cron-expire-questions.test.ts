import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/cron/expire-questions/route";
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

beforeAll(() => {
  process.env.CRON_SECRET ??= "local-test-cron-secret-bishvil";
});

function buildCronRequest(): Request {
  return new Request("http://localhost:3000/api/cron/expire-questions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });
}

describe("POST /api/cron/expire-questions", () => {
  it("rejects requests without the cron secret", async () => {
    const request = new Request("http://localhost:3000/api/cron/expire-questions", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    const response = await POST(request as unknown as Parameters<typeof POST>[0]);
    expect(response.status).toBe(401);
  });

  it("locks an expired sync question past its deadline", async () => {
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

    const response = await POST(
      buildCronRequest() as unknown as Parameters<typeof POST>[0],
    );
    const body = (await response.json()) as {
      scanned: number;
      syncLocked: number;
    };

    expect(response.status).toBe(200);
    expect(body.syncLocked).toBeGreaterThanOrEqual(1);

    const rows = await sql<{ status: string }[]>`
      select status::text as status from public.question_session_state
      where session_id = ${fixtures.sessionId}::uuid
        and question_id = ${fixtures.questionId}::uuid
    `;
    expect(rows[0]?.status).toBe("locked");
  });

  it("auto-reveals an expired async progress row", async () => {
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
        now() - interval '1 minute',
        now() - interval '10 seconds'
      )
    `;

    const response = await POST(
      buildCronRequest() as unknown as Parameters<typeof POST>[0],
    );
    const body = (await response.json()) as { asyncRevealed: number };

    expect(response.status).toBe(200);
    expect(body.asyncRevealed).toBeGreaterThanOrEqual(1);

    const rows = await sql<{ status: string; revealed_at: string | null }[]>`
      select status::text as status, revealed_at
      from public.participant_question_progress
      where session_id = ${fixtures.sessionId}::uuid
        and participant_id = ${fixtures.participantId}::uuid
        and question_id = ${fixtures.questionId}::uuid
    `;
    expect(rows[0]?.status).toBe("revealed");
    expect(rows[0]?.revealed_at).not.toBeNull();
  });
});
