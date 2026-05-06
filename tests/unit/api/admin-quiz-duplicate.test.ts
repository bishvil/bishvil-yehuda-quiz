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

async function seedQuiz(opts: {
  title: string;
  archived?: boolean;
  questions?: number;
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.quizzes (
      owner_id, brand_id, title, default_game_mode, custom_logo, custom_logo_label, archived_at
    ) values (
      ${SEED_ADMIN_ID}::uuid,
      'yehuda',
      ${opts.title},
      'sync',
      'https://example.com/logo.png',
      'גדוד 7',
      ${opts.archived ? sql`now()` : null}
    ) returning id
  `;
  if (!row) throw new Error("Failed to seed quiz.");
  cleanupQuizIds.push(row.id);

  const count = opts.questions ?? 0;
  for (let i = 0; i < count; i += 1) {
    await sql`
      insert into public.questions (quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
      values (
        ${row.id}::uuid,
        ${i + 1},
        'single',
        ${`שאלה ${i + 1}`},
        ${sql.json([
          { id: "a", text: "א" },
          { id: "b", text: "ב" },
        ])},
        ARRAY['a']::text[],
        25,
        1500
      )
    `;
  }
  return row.id;
}

async function callDuplicate(
  id: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import(
    "@/app/api/admin/quizzes/[id]/duplicate/route"
  );
  const request = new Request(
    `http://localhost:3000/api/admin/quizzes/${id}/duplicate`,
    { method: "POST" },
  ) as unknown as Parameters<typeof POST>[0];
  const context = {
    params: Promise.resolve({ id }),
  } as Parameters<typeof POST>[1];
  const response = await POST(request, context);
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

describe("POST /api/admin/quizzes/[id]/duplicate (ADR-0013)", () => {
  it("creates a new active quiz with prefixed title and copies all questions", async () => {
    const sourceId = await seedQuiz({ title: "מסע מקורי", questions: 3 });

    const result = await callDuplicate(sourceId);

    expect(result.status).toBe(201);
    const quiz = (result.body as { quiz: { id: string; title: string } }).quiz;
    expect(quiz.title).toBe("עותק של מסע מקורי");
    cleanupQuizIds.push(quiz.id);

    const [row] = await sql<
      { archived_at: string | null; owner_id: string }[]
    >`
      select archived_at, owner_id from public.quizzes where id = ${quiz.id}::uuid
    `;
    expect(row?.archived_at).toBeNull();
    expect(row?.owner_id).toBe(SEED_ADMIN_ID);

    const copiedQuestions = await sql<
      { ordinal: number; prompt: string }[]
    >`
      select ordinal, prompt from public.questions
      where quiz_id = ${quiz.id}::uuid order by ordinal
    `;
    expect(copiedQuestions).toHaveLength(3);
    expect(copiedQuestions.map((q) => q.prompt)).toEqual([
      "שאלה 1",
      "שאלה 2",
      "שאלה 3",
    ]);
  });

  it("works on an archived quiz and produces an active duplicate", async () => {
    const sourceId = await seedQuiz({
      title: "ארכיב",
      archived: true,
      questions: 1,
    });

    const result = await callDuplicate(sourceId);

    expect(result.status).toBe(201);
    const quiz = (result.body as { quiz: { id: string } }).quiz;
    cleanupQuizIds.push(quiz.id);

    const [row] = await sql<{ archived_at: string | null }[]>`
      select archived_at from public.quizzes where id = ${quiz.id}::uuid
    `;
    expect(row?.archived_at).toBeNull();
  });

  it("returns 404 for a missing source quiz", async () => {
    const result = await callDuplicate("00000000-0000-4000-8000-000000000000");
    expect(result.status).toBe(404);
    expect(result.body.error).toBe("QUIZ_NOT_FOUND");
  });
});
