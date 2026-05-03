import { afterAll, describe, expect, it, vi } from "vitest";

import { getTestPostgres, SEED_ADMIN_ID, SEED_HOST_ID } from "./test-db";

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
    await sql`delete from public.quizzes where id = ${quizId}::uuid`;
  }
  await sql.end();
});

async function callDelete(
  id: string,
  hard: boolean,
): Promise<{ status: number; body: unknown }> {
  const { DELETE } = await import("@/app/api/admin/quizzes/[id]/route");
  const url = hard
    ? `http://localhost:3000/api/admin/quizzes/${id}?hard=true`
    : `http://localhost:3000/api/admin/quizzes/${id}`;
  const request = new Request(url, {
    method: "DELETE",
  }) as unknown as Parameters<typeof DELETE>[0];
  const context = {
    params: Promise.resolve({ id }),
  } as Parameters<typeof DELETE>[1];
  const response = await DELETE(request, context);
  return { status: response.status, body: await response.json() };
}

async function seedQuiz(opts: { archived?: boolean } = {}): Promise<string> {
  const archivedAt = opts.archived ? new Date().toISOString() : null;
  const [row] = await sql<{ id: string }[]>`
    insert into public.quizzes (
      owner_id, brand_id, title, default_game_mode, archived_at
    ) values (
      ${SEED_ADMIN_ID}::uuid,
      'yehuda',
      'QA-21 hard-delete fixture',
      'sync',
      ${archivedAt}
    )
    returning id
  `;
  if (!row) throw new Error("Failed to seed quiz fixture.");
  cleanupQuizIds.push(row.id);
  return row.id;
}

async function seedSessionForQuiz(quizId: string): Promise<string> {
  const pin = String(Math.floor(100_000 + Math.random() * 900_000));
  const [row] = await sql<{ id: string }[]>`
    insert into public.sessions (quiz_id, host_id, pin, status, game_mode, auto_reveal)
    values (
      ${quizId}::uuid,
      ${SEED_HOST_ID}::uuid,
      ${pin},
      'ended',
      'sync',
      false
    )
    returning id
  `;
  if (!row) throw new Error("Failed to seed session fixture.");
  cleanupSessionIds.push(row.id);
  return row.id;
}

describe("DELETE /api/admin/quizzes/[id]?hard=true [QA-21]", () => {
  it("rejects hard delete when quiz is not archived (409 NOT_ARCHIVED)", async () => {
    const quizId = await seedQuiz({ archived: false });
    const result = await callDelete(quizId, true);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "NOT_ARCHIVED" });

    const [row] = await sql<{ id: string }[]>`
      select id from public.quizzes where id = ${quizId}::uuid
    `;
    expect(row?.id).toBe(quizId);
  });

  it("rejects hard delete when quiz has sessions (409 HAS_SESSIONS with count)", async () => {
    const quizId = await seedQuiz({ archived: true });
    await seedSessionForQuiz(quizId);

    const result = await callDelete(quizId, true);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: "HAS_SESSIONS",
      sessionCount: 1,
    });

    const [row] = await sql<{ id: string }[]>`
      select id from public.quizzes where id = ${quizId}::uuid
    `;
    expect(row?.id).toBe(quizId);
  });

  it("hard-deletes archived quiz with zero sessions and cascades questions", async () => {
    const quizId = await seedQuiz({ archived: true });

    // Seed a question to verify cascade.
    await sql`
      insert into public.questions (quiz_id, ordinal, type, prompt, options, correct_ids, time_seconds, points)
      values (
        ${quizId}::uuid,
        ${10_000 + Math.floor(Math.random() * 1_000_000)},
        'single',
        'cascade-check',
        ${sql.json([{ id: "a", text: "A" }])},
        ARRAY['a']::text[],
        25,
        1500
      )
    `;

    const result = await callDelete(quizId, true);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "deleted", id: quizId });

    const rows = await sql<{ id: string }[]>`
      select id from public.quizzes where id = ${quizId}::uuid
    `;
    expect(rows.length).toBe(0);

    const qrows = await sql<{ id: string }[]>`
      select id from public.questions where quiz_id = ${quizId}::uuid
    `;
    expect(qrows.length).toBe(0);

    // Already deleted — drop from cleanup list.
    const idx = cleanupQuizIds.indexOf(quizId);
    if (idx >= 0) cleanupQuizIds.splice(idx, 1);
  });

  it("returns 404 when the quiz does not exist", async () => {
    const result = await callDelete(
      "00000000-0000-4000-8000-000000000000",
      true,
    );
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: "QUIZ_NOT_FOUND" });
  });

  it("default DELETE (no ?hard) still soft-archives", async () => {
    const quizId = await seedQuiz({ archived: false });
    const result = await callDelete(quizId, false);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "archived" });

    const [row] = await sql<{ archived_at: string | null }[]>`
      select archived_at from public.quizzes where id = ${quizId}::uuid
    `;
    expect(row?.archived_at).not.toBeNull();
  });
});
