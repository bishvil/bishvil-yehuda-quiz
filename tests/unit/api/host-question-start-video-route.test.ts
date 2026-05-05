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
      claims: { userId: SEED_HOST_ID, role: "host", sessionId: null, participantId: null },
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

async function callStart(pin: string, questionId: string) {
  const { POST } = await import("@/app/api/host/[pin]/question/start/route");
  const response = await POST(
    new Request(`http://localhost:3000/api/host/${pin}/question/start`, {
      method: "POST",
      body: JSON.stringify({ questionId }),
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof POST>[1],
  );
  return { status: response.status, body: await response.json() };
}

describe("POST /api/host/[pin]/question/start for video", () => {
  it("starts sync video questions in presenting without a deadline", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);
    await sql`
      update public.questions
      set type = 'video',
          video_url = 'https://cdn.example.com/video.mp4',
          video_provider = 'self'
      where id = ${fixtures.questionId}::uuid
    `;

    const result = await callStart(fixtures.pin, fixtures.questionId);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "presenting", deadlineAt: null });
    const [row] = await sql<{ status: string; deadline_at: string | null }[]>`
      select status, deadline_at
      from public.question_session_state
      where session_id = ${fixtures.sessionId}::uuid
        and question_id = ${fixtures.questionId}::uuid
    `;
    expect(row).toMatchObject({ status: "presenting", deadline_at: null });
  });
});

