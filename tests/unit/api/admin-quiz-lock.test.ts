import { afterAll, describe, expect, it, vi } from "vitest";

import { LOCKED_QUIZ_EDIT_HEADER } from "@/src/lib/admin/quiz-edit-override";
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
    // sessions(quiz_id) is ON DELETE RESTRICT — clear them first.
    await sql`delete from public.sessions where quiz_id = ${quizId}::uuid`;
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
  }
  await sql.end();
});

interface SeedResult {
  quizId: string;
  questionId: string;
}

async function seedQuizWithSession(withSession: boolean): Promise<SeedResult> {
  const [quiz] = await sql<{ id: string }[]>`
    insert into public.quizzes (owner_id, brand_id, title, default_game_mode)
    values (${SEED_ADMIN_ID}::uuid, 'yehuda', 'Lock fixture', 'sync')
    returning id
  `;
  if (!quiz) throw new Error("Quiz seed failed");
  cleanupQuizIds.push(quiz.id);

  const [question] = await sql<{ id: string }[]>`
    insert into public.questions (quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
    values (
      ${quiz.id}::uuid, 1, 'single', 'שאלה',
      ${sql.json([
        { id: "a", text: "א" },
        { id: "b", text: "ב" },
      ])},
      ARRAY['a']::text[], 25, 1500
    )
    returning id
  `;
  if (!question) throw new Error("Question seed failed");

  if (withSession) {
    const pin = String(Math.floor(100_000 + Math.random() * 900_000));
    await sql`
      insert into public.sessions (quiz_id, pin, status, game_mode, auto_reveal)
      values (${quiz.id}::uuid, ${pin}, 'draft', 'sync', false)
    `;
  }

  return { quizId: quiz.id, questionId: question.id };
}

describe("Quiz lock guard (ADR-0013)", () => {
  it("PUT /quizzes/[id]/questions/[questionId] returns 409 QUIZ_LOCKED when a session exists", async () => {
    const { quizId, questionId } = await seedQuizWithSession(true);
    const { PUT } =
      await import("@/app/api/admin/quizzes/[id]/questions/[questionId]/route");
    const request = new Request(
      `http://localhost:3000/api/admin/quizzes/${quizId}/questions/${questionId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "ניסיון לשנות" }),
      },
    ) as unknown as Parameters<typeof PUT>[0];
    const response = await PUT(request, {
      params: Promise.resolve({ id: quizId, questionId }),
    } as Parameters<typeof PUT>[1]);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("QUIZ_LOCKED");
  });

  it("PUT /quizzes/[id]/questions/[questionId] allows a locked quiz with the explicit override header", async () => {
    const { quizId, questionId } = await seedQuizWithSession(true);
    const { PUT } =
      await import("@/app/api/admin/quizzes/[id]/questions/[questionId]/route");
    const request = new Request(
      `http://localhost:3000/api/admin/quizzes/${quizId}/questions/${questionId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          [LOCKED_QUIZ_EDIT_HEADER]: "true",
        },
        body: JSON.stringify({ prompt: "עודכן בכוונה" }),
      },
    ) as unknown as Parameters<typeof PUT>[0];
    const response = await PUT(request, {
      params: Promise.resolve({ id: quizId, questionId }),
    } as Parameters<typeof PUT>[1]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      question: { prompt: "עודכן בכוונה" },
    });
  });

  it("POST /quizzes/[id]/questions returns 409 QUIZ_LOCKED when a session exists", async () => {
    const { quizId } = await seedQuizWithSession(true);
    const { POST } =
      await import("@/app/api/admin/quizzes/[id]/questions/route");
    const request = new Request(
      `http://localhost:3000/api/admin/quizzes/${quizId}/questions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ordinal: 99,
          type: "single",
          prompt: "חדש",
          options: [{ id: "a", text: "א" }],
          correctIds: ["a"],
          timeSeconds: 25,
          points: 1500,
        }),
      },
    ) as unknown as Parameters<typeof POST>[0];
    const response = await POST(request, {
      params: Promise.resolve({ id: quizId }),
    } as Parameters<typeof POST>[1]);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe(
      "QUIZ_LOCKED",
    );
  });

  it("PUT succeeds when the quiz has no sessions", async () => {
    const { quizId, questionId } = await seedQuizWithSession(false);
    const { PUT } =
      await import("@/app/api/admin/quizzes/[id]/questions/[questionId]/route");
    const request = new Request(
      `http://localhost:3000/api/admin/quizzes/${quizId}/questions/${questionId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "עודכן" }),
      },
    ) as unknown as Parameters<typeof PUT>[0];
    const response = await PUT(request, {
      params: Promise.resolve({ id: quizId, questionId }),
    } as Parameters<typeof PUT>[1]);
    expect(response.status).toBe(200);
  });

  it("duplicate route is allowed even on a quiz with sessions", async () => {
    const { quizId } = await seedQuizWithSession(true);
    const { POST } =
      await import("@/app/api/admin/quizzes/[id]/duplicate/route");
    const request = new Request(
      `http://localhost:3000/api/admin/quizzes/${quizId}/duplicate`,
      { method: "POST" },
    ) as unknown as Parameters<typeof POST>[0];
    const response = await POST(request, {
      params: Promise.resolve({ id: quizId }),
    } as Parameters<typeof POST>[1]);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { quiz: { id: string } };
    cleanupQuizIds.push(body.quiz.id);
  });
});
