import { afterAll, describe, expect, it, vi } from "vitest";

import { cleanupFixtures, getTestPostgres, seedSyncFixtures } from "./test-db";

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
    requireRole: vi.fn(async () => ({ ok: true, claims: currentClaims })),
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

async function callState(pin: string, participantId: string, sessionId: string) {
  currentClaims = { userId: participantId, role: "participant", sessionId, participantId };
  const { GET } = await import("@/app/api/participant/[pin]/state/route");
  try {
    const response = await GET(
      new Request(`http://localhost:3000/api/participant/${pin}/state`) as Parameters<
        typeof GET
      >[0],
      { params: Promise.resolve({ pin }) } as Parameters<typeof GET>[1],
    );
    return { status: response.status, body: await response.json() };
  } finally {
    currentClaims = null;
  }
}

describe("participant state for presenting video questions", () => {
  it("returns the presenting status and public video fields", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
    cleanupTargets.push(fixtures);
    await sql`
      update public.questions
      set type = 'video',
          video_url = 'https://cdn.example.com/video.mp4',
          video_provider = 'self',
          video_mime_type = 'video/mp4',
          media_lead_seconds = 30
      where id = ${fixtures.questionId}::uuid
    `;
    await sql`
      update public.sessions
      set current_question_id = ${fixtures.questionId}::uuid
      where id = ${fixtures.sessionId}::uuid
    `;
    await sql`
      insert into public.question_session_state (
        session_id, question_id, question_index, status, presenting_at
      ) values (
        ${fixtures.sessionId}::uuid, ${fixtures.questionId}::uuid, 1, 'presenting', now()
      )
    `;

    const result = await callState(
      fixtures.pin,
      fixtures.participantId,
      fixtures.sessionId,
    );

    expect(result.status).toBe(200);
    const body = result.body as {
      question: {
        status: string;
        videoUrl: string | null;
        videoProvider: string | null;
        mediaLeadSeconds: number;
      } | null;
    };
    expect(body.question).toMatchObject({
      status: "presenting",
      videoUrl: "https://cdn.example.com/video.mp4",
      videoProvider: "self",
      mediaLeadSeconds: 30,
    });
  });
});

