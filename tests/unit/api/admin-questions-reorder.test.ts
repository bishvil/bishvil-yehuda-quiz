import { afterAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

import { SEED_ADMIN_ID } from "./test-db";

// Keep independent, stable connections for the concurrent transaction barriers.
function createReorderTestPostgres() {
  return postgres(
    process.env.DIRECT_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 1, idle_timeout: 5, max_lifetime: 60 },
  );
}

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

const sql = createReorderTestPostgres();
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
  const { POST } =
    await import("@/app/api/admin/quizzes/[id]/questions/reorder/route");
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

  const questionsResult = await sql<Array<{ id: string; ordinal: number }>>`
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

  it("returns the shared quiz guard’s 404 for a non-existent quiz", async () => {
    const fakeQuizId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

    const { status, body } = await callReorder(fakeQuizId, {
      ordinals: [{ id: "ffffffff-ffff-4fff-8fff-fffffffffff0", ordinal: 1 }],
    });

    expect(status).toBe(404);
    expect(body).toEqual(
      expect.objectContaining({
        error: "QUIZ_NOT_FOUND",
      }),
    );
  });
});

async function readOrder(quizId: string) {
  return sql<Array<{ id: string; ordinal: number }>>`
    select id, ordinal from public.questions where quiz_id = ${quizId}::uuid order by ordinal
  `;
}

describe("transactional reorder safety", () => {
  it("normalizes sparse ordinals and recovers pre-existing negative/extreme ordinals", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    await sql`update public.questions set ordinal = -2147483648 where id = ${questions[0]!.id}::uuid`;
    await sql`update public.questions set ordinal = -1 where id = ${questions[1]!.id}::uuid`;
    await sql`update public.questions set ordinal = 2147483647 where id = ${questions[2]!.id}::uuid`;
    const requested = [questions[2]!, questions[0]!, questions[1]!].map(
      (q, index) => ({ id: q.id, ordinal: (index + 1) * 50000 }),
    );
    expect((await callReorder(quizId, { ordinals: requested })).status).toBe(
      200,
    );
    expect(await readOrder(quizId)).toEqual(
      requested.map((q, index) => ({ id: q.id, ordinal: index + 1 })),
    );
  });

  it("rejects duplicate IDs even when all current IDs are also supplied", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const result = await callReorder(quizId, {
      ordinals: [...questions, { ...questions[0]!, ordinal: 4 }],
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: "VALIDATION_FAILED" });
    expect(await readOrder(quizId)).toEqual(questions);
  });

  it("rejects a foreign question without changing either quiz", async () => {
    const first = await seedQuizWithQuestions();
    const second = await seedQuizWithQuestions();
    const result = await callReorder(first.quizId, {
      ordinals: [second.questions[0]!, ...first.questions.slice(1)],
    });
    expect(result.status).toBe(400);
    expect(await readOrder(first.quizId)).toEqual(first.questions);
    expect(await readOrder(second.quizId)).toEqual(second.questions);
  });

  it("rolls back every temporary and final write if a later update fails", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const suffix = quizId.replaceAll("-", "");
    const functionName = `test_reorder_failure_${suffix}`;
    const triggerName = `test_reorder_failure_${suffix}`;
    await sql.unsafe(
      `create function public.${functionName}() returns trigger language plpgsql as $$ begin raise exception 'forced reorder failure'; end; $$`,
    );
    await sql.unsafe(
      `create trigger ${triggerName} before update on public.questions for each row when (new.quiz_id = '${quizId}'::uuid and new.id = '${questions[0]!.id}'::uuid and old.ordinal < 0 and new.ordinal > 0) execute function public.${functionName}()`,
    );
    try {
      const result = await callReorder(quizId, {
        ordinals: [...questions]
          .reverse()
          .map((q, index) => ({ id: q.id, ordinal: index + 1 })),
      });
      expect(result.status).toBe(500);
      expect(result.body).toMatchObject({ error: "WRITE_FAILED" });
      expect(await readOrder(quizId)).toEqual(questions);
    } finally {
      await sql.unsafe(`drop trigger ${triggerName} on public.questions`);
      await sql.unsafe(`drop function public.${functionName}()`);
    }
  });

  it.each(["anon", "authenticated"])(
    "denies direct reorder execution to %s",
    async (role) => {
      const [row] =
        await sql`select has_function_privilege(${role}, 'public.reorder_quiz_questions(uuid,jsonb,boolean)', 'execute') as allowed`;
      expect(row?.allowed).toBe(false);
    },
  );

  it("serializes concurrent complete orders and exposes no intermediate negative ordinals", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const blocker = createReorderTestPostgres();
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const firstOrder = [questions[2]!, questions[1]!, questions[0]!].map(
      (q, index) => ({ id: q.id, ordinal: index + 1 }),
    );
    const secondOrder = [questions[1]!, questions[0]!, questions[2]!].map(
      (q, index) => ({ id: q.id, ordinal: index + 1 }),
    );
    const first = blocker.begin(async (tx) => {
      await tx`select id from public.quizzes where id = ${quizId}::uuid for update`;
      locked();
      await gate;
      await tx`select public.reorder_quiz_questions(${quizId}::uuid, ${sql.json(firstOrder)}::jsonb)`;
    });
    let second: ReturnType<typeof callReorder> | undefined;
    try {
      await ready;
      second = callReorder(quizId, { ordinals: secondOrder });
      await waitForBlockedReorder();
      expect(await readOrder(quizId)).toEqual(questions);
      release();
      await first;
      expect((await second).status).toBe(200);
      expect(await readOrder(quizId)).toEqual(secondOrder);
    } finally {
      release();
      await Promise.allSettled([first, second]);
      await blocker.end();
    }
  });

  it("revalidates the complete set after a concurrent insert commits", async () => {
    const { quizId, questions } = await seedQuizWithQuestions();
    const blocker = createReorderTestPostgres();
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const insertion = blocker.begin(async (tx) => {
      await tx`select id from public.quizzes where id = ${quizId}::uuid for update`;
      locked();
      await gate;
      await tx`insert into public.questions (quiz_id, ordinal, type, prompt) values (${quizId}::uuid, 4, 'content', 'Concurrent station')`;
    });
    let reorder: ReturnType<typeof callReorder> | undefined;
    try {
      await ready;
      reorder = callReorder(quizId, {
        ordinals: [...questions]
          .reverse()
          .map((q, index) => ({ id: q.id, ordinal: index + 1 })),
      });
      await waitForBlockedReorder();
      release();
      await insertion;
      expect((await reorder).status).toBe(400);
      expect(await readOrder(quizId)).toEqual([
        ...questions,
        expect.objectContaining({ ordinal: 4 }),
      ]);
    } finally {
      release();
      await Promise.allSettled([insertion, reorder]);
      await blocker.end();
    }
  });
});

async function waitForBlockedReorder() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [row] =
      await sql`select exists(select 1 from pg_stat_activity where wait_event_type = 'Lock' and query like '%reorder_quiz_questions%') as waiting`;
    if (row?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Concurrent reorder did not reach the quiz lock");
}
