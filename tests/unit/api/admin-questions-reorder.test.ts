import { afterAll, describe, expect, it, vi } from "vitest";

import { getTestPostgres, SEED_ADMIN_ID } from "./test-db";

vi.mock("@/src/lib/auth/server-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/auth/server-auth")
  >("@/src/lib/auth/server-auth");
  return {
    ...actual,
    requireRole: vi.fn(async () => ({
      ok: true,
      claims: {
        userId: SEED_ADMIN_ID,
        role: "admin",
        sessionId: null,
        participantId: null,
      },
    })),
  };
});

const sql = getTestPostgres();
const cleanupQuizIds: string[] = [];

afterAll(async () => {
  for (const quizId of cleanupQuizIds) {
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
  }
  await sql.end();
});

async function callReorder(
  quizId: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const { POST } = await import(
    "@/app/api/admin/quizzes/[id]/questions/reorder/route"
  );
  const request = new Request(
    `http://localhost:3000/api/admin/quizzes/${quizId}/questions/reorder`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as unknown as Parameters<typeof POST>[0];
  const context = {
    params: Promise.resolve({ id: quizId }),
  } as Parameters<typeof POST>[1];
  const response = await POST(request, context);
  return { status: response.status, body: await response.json() };
}

async function seedQuizWithQuestions(): Promise<{
  quizId: string;
  questions: Array<{ id: string; ordinal: number }>;
}> {
  const quizResult = await sql<[{ id: string }]>`
    insert into public.quizzes
      (owner_id, brand_id, title, default_game_mode)
    values
      (${SEED_ADMIN_ID}::uuid, 'yehuda', 'Test Quiz', 'sync')
    returning id
  `;
  const quizId = quizResult[0].id;
  cleanupQuizIds.push(quizId);

  const questionsResult = await sql<
    Array<{ id: string; ordinal: number }>
  >`
    insert into public.questions
      (quiz_id, ordinal, type, prompt, time_seconds, points)
    values
      (${quizId}::uuid, 1, 'single', 'Question 1', 25, 1000),
      (${quizId}::uuid, 2, 'multi', 'Question 2', 25, 1000),
      (${quizId}::uuid, 3, 'truefalse', 'Question 3', 25, 1000)
    returning id, ordinal
  `;

  // Sort by ordinal
  const sorted = questionsResult.sort((a, b) => a.ordinal - b.ordinal);

  return { quizId, questions: sorted };
}

describe("POST /api/admin/quizzes/[id]/questions/reorder", () => {
  it("reorders questions successfully (swap ordinals 1 and 2)", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const [q1, q2, q3] = questions;
    if (!q1 || !q2 || !q3) throw new Error("seed missing questions");

    const { status, body } = await callReorder(quizId, {
      ordinals: [
        { id: q2.id, ordinal: 1 },
        { id: q1.id, ordinal: 2 },
        { id: q3.id, ordinal: 3 },
      ],
    });

    expect(status).toBe(200);
    expect(body).toEqual({ status: "reordered", count: 3 });

    // Verify ordinals in database
    const result = await sql<
      Array<{ id: string; ordinal: number }>
    >`select id, ordinal from public.questions where quiz_id = ${quizId}::uuid order by ordinal asc`;

    expect(result.length).toBe(3);
    expect(result[0]).toEqual({ id: q2.id, ordinal: 1 });
    expect(result[1]).toEqual({ id: q1.id, ordinal: 2 });
    expect(result[2]).toEqual({ id: q3.id, ordinal: 3 });
  });

  it("rejects incomplete reorder (missing question)", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const [q1, q2] = questions;
    if (!q1 || !q2) throw new Error("seed missing questions");

    const { status, body } = await callReorder(quizId, {
      ordinals: [
        { id: q1.id, ordinal: 1 },
        { id: q2.id, ordinal: 2 },
        // q3 is missing
      ],
    });

    expect(status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: "VALIDATION_FAILED",
        message: expect.stringContaining("all questions"),
      }),
    );
  });

  it("rejects invalid body format", async () => {
    const { quizId } = await seedQuizWithQuestions();

    // Missing id (required)
    const { status, body } = await callReorder(quizId, {
      ordinals: [{ ordinal: 1 }],
    });

    expect(status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: "INVALID_REQUEST",
        message: expect.stringContaining("invalid"),
      }),
    );
  });

  it("rejects reorder for non-existent quiz (validation happens first)", async () => {
    const fakeQuizId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

    // When passing ordinals that don't match the (non-existent) quiz,
    // validation catches it first (before we check if quiz exists).
    const { status, body } = await callReorder(fakeQuizId, {
      ordinals: [
        { id: "ffffffff-ffff-ffff-ffff-fffffffffff0", ordinal: 1 },
      ],
    });

    expect(status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.stringMatching(/VALIDATION_FAILED|INVALID_REQUEST/),
      }),
    );
  });
});
