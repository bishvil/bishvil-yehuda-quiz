import { afterAll, describe, expect, it, vi } from "vitest";

import {
  cleanupFixtures,
  getTestPostgres,
  seedAdditionalQuestion,
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
      claims: {
        userId: SEED_HOST_ID,
        role: "host",
        sessionId: null,
        participantId: null,
      },
    })),
  };
});

const sql = getTestPostgres();
const cleanupTargets: Array<{
  sessionId: string;
  questionId: string;
  participantId: string;
  extraQuestionIds: string[];
  quizId: string;
}> = [];

afterAll(async () => {
  for (const target of cleanupTargets) {
    await cleanupFixtures(
      sql,
      target.sessionId,
      target.questionId,
      target.participantId,
    );
    for (const questionId of target.extraQuestionIds) {
      await sql`delete from public.questions where id = ${questionId}::uuid`;
    }
    await sql`delete from public.quizzes where id = ${target.quizId}::uuid`;
  }
  await sql.end();
});

async function callNextPost(pin: string): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/host/[pin]/question/next/route");
  const response = await POST(
    new Request(`http://localhost:3000/api/host/${pin}/question/next`, {
      method: "POST",
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof POST>[1],
  );
  return { status: response.status, body: await response.json() };
}

async function seedCurrentQuestionState(
  status: "answering" | "locked" | "revealed",
  hasNext: boolean,
  sessionStatus: "live" | "paused" = "live",
) {
  const fixtures = await seedSyncFixtures(sql, { gameMode: "sync" });
  const [quiz] = await sql<{ id: string }[]>`
    insert into public.quizzes (owner_id, brand_id, title, default_game_mode)
    values (
      '22222222-2222-4222-8222-222222222222'::uuid,
      'yehuda',
      'Host next isolated quiz',
      'sync'
    )
    returning id
  `;
  if (!quiz) {
    throw new Error("Failed to create isolated quiz fixture.");
  }
  const next = hasNext ? await seedAdditionalQuestion(sql) : null;
  cleanupTargets.push({
    sessionId: fixtures.sessionId,
    questionId: fixtures.questionId,
    participantId: fixtures.participantId,
    extraQuestionIds: next ? [next.questionId] : [],
    quizId: quiz.id,
  });

  const ordinalBase = 2_000_000_000 + Math.floor(Math.random() * 100_000);
  await sql`
    update public.sessions
    set quiz_id = ${quiz.id}::uuid
    where id = ${fixtures.sessionId}::uuid
  `;
  await sql`
    update public.questions
    set quiz_id = ${quiz.id}::uuid,
        ordinal = ${ordinalBase}
    where id = ${fixtures.questionId}::uuid
  `;
  if (next) {
    await sql`
      update public.questions
      set quiz_id = ${quiz.id}::uuid,
          ordinal = ${ordinalBase + 1}
      where id = ${next.questionId}::uuid
    `;
  }

  await sql`
    update public.sessions
    set current_question_id = ${fixtures.questionId}::uuid,
        status = ${sessionStatus}::public.session_status
    where id = ${fixtures.sessionId}::uuid
  `;

  await sql`
    insert into public.question_session_state (
      session_id, question_id, question_index, status, started_at, deadline_at, revealed_at
    ) values (
      ${fixtures.sessionId}::uuid,
      ${fixtures.questionId}::uuid,
      1,
      ${status}::public.question_status,
      now(),
      now() + interval '60 seconds',
      case when ${status} = 'revealed' then now() else null end
    )
  `;

  return { ...fixtures, next };
}

describe("POST /api/host/[pin]/question/next", () => {
  it("denies answering and locked current questions", async () => {
    const answering = await seedCurrentQuestionState("answering", true);
    const answeringResult = await callNextPost(answering.pin);
    expect(answeringResult.status).toBe(409);
    expect(answeringResult.body).toMatchObject({ error: "QUESTION_NOT_REVEALED" });

    const locked = await seedCurrentQuestionState("locked", true);
    const lockedResult = await callNextPost(locked.pin);
    expect(lockedResult.status).toBe(409);
    expect(lockedResult.body).toMatchObject({ error: "QUESTION_NOT_REVEALED" });
  });

  it("advances after reveal and ends after the last revealed question", async () => {
    const withNext = await seedCurrentQuestionState("revealed", true);
    const advanced = await callNextPost(withNext.pin);
    expect(advanced.status).toBe(200);
    expect(advanced.body).toMatchObject({
      status: "advanced",
      nextQuestionId: withNext.next?.questionId,
    });

    const last = await seedCurrentQuestionState("revealed", false);
    const ended = await callNextPost(last.pin);
    expect(ended.status).toBe(200);
    expect(ended.body).toMatchObject({ status: "all_revealed" });

    const [session] = await sql<{ status: string }[]>`
      select status from public.sessions where id = ${last.sessionId}::uuid
    `;
    expect(session?.status).toBe("ended");
  });

  it("rejects paused revealed sessions without changing current_question_id", async () => {
    const paused = await seedCurrentQuestionState("revealed", true, "paused");

    const result = await callNextPost(paused.pin);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ error: "SESSION_PAUSED" });

    const [session] = await sql<{ current_question_id: string; status: string }[]>`
      select current_question_id, status
      from public.sessions
      where id = ${paused.sessionId}::uuid
    `;
    expect(session?.status).toBe("paused");
    expect(session?.current_question_id).toBe(paused.questionId);
  });
});
