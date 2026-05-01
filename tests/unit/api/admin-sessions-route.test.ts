import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const cleanupSessionIds: string[] = [];

afterAll(async () => {
  for (const sessionId of cleanupSessionIds) {
    await sql`delete from public.sessions where id = ${sessionId}::uuid`;
  }
  for (const quizId of cleanupQuizIds) {
    await sql`delete from public.questions where quiz_id = ${quizId}::uuid`;
    await sql`delete from public.sessions where quiz_id = ${quizId}::uuid`;
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
  }
  await sql.end();
});

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
});

async function callPost(body: unknown): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/admin/sessions/route");
  const request = new Request("http://localhost:3000/api/admin/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

async function seedQuiz({ withQuestion }: { withQuestion: boolean }): Promise<{
  quizId: string;
}> {
  // Brand id must satisfy `quizzes_brand_id_check`
  // (see supabase/migrations/20260501035700_backend_check_constraints.sql).
  const [quizRow] = await sql<{ id: string }[]>`
    insert into public.quizzes (owner_id, brand_id, title, default_game_mode)
    values (
      ${SEED_ADMIN_ID}::uuid,
      'yehuda',
      'Empty-launch guard fixture',
      'sync'
    )
    returning id
  `;
  if (!quizRow) {
    throw new Error("Failed to seed quiz fixture.");
  }
  cleanupQuizIds.push(quizRow.id);

  if (withQuestion) {
    // Use a high random ordinal to avoid colliding with the project seed.
    const ordinal = 9_000_000 + Math.floor(Math.random() * 1_000_000);
    await sql`
      insert into public.questions (quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
      values (
        ${quizRow.id}::uuid,
        ${ordinal},
        'single',
        'Seeded question',
        ${sql.json([
          { id: "a", text: "Option A" },
          { id: "b", text: "Option B" },
        ])},
        ARRAY['a']::text[],
        25,
        1500
      )
    `;
  }

  return { quizId: quizRow.id };
}

describe("POST /api/admin/sessions — non-empty quiz launch enforcement (M2)", () => {
  it("rejects launching a quiz that has zero questions with QUIZ_HAS_NO_QUESTIONS (400)", async () => {
    const { quizId } = await seedQuiz({ withQuestion: false });

    const result = await callPost({ quizId });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: "QUIZ_HAS_NO_QUESTIONS",
    });

    // No session row must be created when the guard fires.
    const sessions = await sql<{ id: string }[]>`
      select id from public.sessions where quiz_id = ${quizId}::uuid
    `;
    expect(sessions).toHaveLength(0);
  });

  it("creates a scheduled session when the quiz has at least one question", async () => {
    const { quizId } = await seedQuiz({ withQuestion: true });

    const result = await callPost({ quizId });

    expect(result.status).toBe(201);
    const body = result.body as {
      session: { id: string; status: string; quizId: string; pin: string };
    };
    expect(body.session).toMatchObject({
      status: "scheduled",
      quizId,
    });
    expect(body.session.pin).toMatch(/^\d{6}$/);

    cleanupSessionIds.push(body.session.id);
  });
});
