import { afterAll, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
  SEED_ADMIN_ID,
  SEED_QUIZ_ID,
} from "./test-db";
let claims: {
  userId: string;
  role: "participant" | "admin";
  sessionId?: string;
} | null = null;
vi.mock("@/src/lib/auth/server-auth", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/auth/server-auth")
  >("@/src/lib/auth/server-auth");
  return {
    ...actual,
    requireRole: vi.fn(async (role: string) =>
      claims?.role === role
        ? { ok: true, claims }
        : { ok: false, response: new Response(null, { status: 401 }) },
    ),
  };
});
const sql = getTestPostgres();
const fixtures: Awaited<ReturnType<typeof seedSyncFixtures>>[] = [];
const isolatedQuizzes: string[] = [];
afterAll(async () => {
  for (const f of fixtures)
    await cleanupFixtures(sql, f.sessionId, f.questionId, f.participantId);
  for (const id of isolatedQuizzes)
    await sql`delete from public.quizzes where id = ${id}::uuid`;
  await sql.end();
});
async function fixture(
  type: "single" | "open" | "content" = "single",
  settings: import("@/src/lib/schemas/question-settings").QuestionSettings = {},
) {
  const f = await seedSyncFixtures(sql, { gameMode: "async" });
  fixtures.push(f);
  await sql`update public.questions set type = ${type}::public.question_type, settings = ${sql.json(settings)} where id = ${f.questionId}::uuid`;
  await sql`insert into public.participant_question_progress(session_id, participant_id, question_id, question_index, status, started_at, deadline_at)
    select ${f.sessionId}::uuid, ${f.participantId}::uuid, id, ordinal, 'answering', now() - interval '10 minutes', null from public.questions where id = ${f.questionId}::uuid`;
  claims = {
    userId: f.participantId,
    role: "participant",
    sessionId: f.sessionId,
  };
  return f;
}
async function answer(f: Awaited<ReturnType<typeof fixture>>, payload: object) {
  const { POST } = await import("@/app/api/session/[pin]/answer/route");
  const response = await POST(
    new Request(`http://localhost/api/session/${f.pin}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: f.questionId, ...payload }),
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin: f.pin }) },
  );
  return { status: response.status, body: await response.json() };
}
async function state(f: Awaited<ReturnType<typeof fixture>>) {
  const { GET } = await import("@/app/api/participant/[pin]/state/route");
  return (
    await GET(
      new Request(
        `http://localhost/api/participant/${f.pin}/state`,
      ) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ pin: f.pin }) },
    )
  ).json();
}
async function unlock(
  f: Awaited<ReturnType<typeof fixture>>,
  lat = 31.5,
  accuracy = 5,
) {
  const { POST } = await import("@/app/api/participant/[pin]/unlock/route");
  const response = await POST(
    new Request("http://localhost/unlock", {
      method: "POST",
      body: JSON.stringify({
        questionId: f.questionId,
        lat,
        lng: 34.9,
        accuracy,
        measuredAt: new Date().toISOString(),
      }),
    }),
    { params: Promise.resolve({ pin: f.pin }) },
  );
  return { status: response.status, body: await response.json() };
}
describe("new question capabilities against real Postgres + API", () => {
  it("awards full accuracy points to an untimed answer after a long wait, once only", async () => {
    const f = await fixture("single", { timeLimitEnabled: false });
    const first = await answer(f, { selectedIds: ["a"] });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      isCorrect: true,
      score: 1500,
      timeBonus: 0,
    });
    expect((await answer(f, { selectedIds: ["b"] })).body).toMatchObject({
      status: "already_submitted",
      isCorrect: true,
      score: 1500,
    });
    const [score] =
      await sql`select total_score, correct_count from public.participant_scores where session_id = ${f.sessionId}::uuid`;
    expect(score).toMatchObject({ total_score: 1500, correct_count: 1 });
  });
  it("keeps a slow timed correct answer correct while rejecting one after the deadline", async () => {
    const f = await fixture();
    await sql`update public.participant_question_progress set deadline_at = now() + interval '4 seconds' where session_id = ${f.sessionId}::uuid`;
    expect((await answer(f, { selectedIds: ["a"] })).body).toMatchObject({
      isCorrect: true,
    });
    const late = await fixture();
    await sql`update public.participant_question_progress set deadline_at = now() - interval '1 second' where session_id = ${late.sessionId}::uuid`;
    expect(await answer(late, { selectedIds: ["a"] })).toMatchObject({
      status: 409,
      body: { error: "LATE_SUBMISSION" },
    });
    expect((await state(late)).myAnswer).toBeNull();
  });
  it("normalizes Hebrew niqqud, Unicode, casing and whitespace for open answers, preserving original text", async () => {
    const f = await fixture("open", {
      timeLimitEnabled: false,
      acceptedAnswers: ["ירושלים", "Tel Aviv"],
    });
    expect(await answer(f, { textAnswer: "יְרוּשָׁלַיִם" })).toMatchObject({
      status: 200,
      body: { isCorrect: true, score: 1500 },
    });
    expect((await state(f)).myAnswer.textAnswer).toBe("יְרוּשָׁלַיִם");
    const other = await fixture("open", {
      timeLimitEnabled: false,
      acceptedAnswers: ["Tel Aviv"],
    });
    expect(
      (await answer(other, { textAnswer: "  TEL   AVIV  " })).body.isCorrect,
    ).toBe(true);
    const wrong = await fixture("open", {
      timeLimitEnabled: false,
      acceptedAnswers: ["ירושלים"],
    });
    expect((await answer(wrong, { textAnswer: "חיפה" })).body).toMatchObject({
      isCorrect: false,
      score: 0,
    });
  });
  it("does not leak accepted answers and refuses the wrong answer kind", async () => {
    const f = await fixture("open", {
      timeLimitEnabled: false,
      acceptedAnswers: ["PRIVATE_ACCEPTED_ANSWER"],
    });
    expect(JSON.stringify(await state(f))).not.toContain(
      "PRIVATE_ACCEPTED_ANSWER",
    );
    expect((await answer(f, { selectedIds: ["a"] })).status).toBe(409);
  });
  it("keeps GPS content and the answer timer locked until an accurate in-range reading, then persists one unlock", async () => {
    const f = await fixture("single", {
      locationGate: { lat: 31.5, lng: 34.9, radiusM: 100 },
    });
    await sql`update public.participant_question_progress set started_at = null where session_id = ${f.sessionId}::uuid`;
    const locked = await state(f);
    expect(locked.question).toMatchObject({
      locationLocked: true,
      options: null,
      deadlineAt: null,
    });
    expect(JSON.stringify(locked)).not.toContain("Test prompt");
    expect((await answer(f, { selectedIds: ["a"] })).status).toBe(409);
    expect(await unlock(f, 32)).toMatchObject({
      status: 409,
      body: { error: "outside_radius" },
    });
    expect(await unlock(f, 31.5, 200)).toMatchObject({
      status: 409,
      body: { error: "location_inaccurate" },
    });
    expect((await unlock(f)).status).toBe(200);
    const [first] =
      await sql`select started_at, deadline_at, location_unlocked_at from public.participant_question_progress where session_id = ${f.sessionId}::uuid`;
    if (!first) throw new Error("Missing unlocked progress");
    expect(first.location_unlocked_at).not.toBeNull();
    expect(first.deadline_at.getTime() - first.started_at.getTime()).toBe(
      25000,
    );
    expect((await unlock(f, 32)).status).toBe(200);
    const [again] =
      await sql`select started_at from public.participant_question_progress where session_id = ${f.sessionId}::uuid`;
    if (!again) throw new Error("Missing persisted progress");
    expect(again.started_at).toEqual(first.started_at);
    expect((await state(f)).question.prompt).toBe("Test prompt");
    expect((await answer(f, { selectedIds: ["a"] })).body.isCorrect).toBe(true);
  });
  it("finishes a content-only async route without writing a scored answer and remembers completion", async () => {
    const f = await fixture("content");
    const [quiz] =
      await sql`insert into public.quizzes(owner_id,brand_id,title,default_game_mode)
      select owner_id,brand_id,'Content test','async' from public.quizzes where id = ${SEED_QUIZ_ID}::uuid returning id`;
    if (!quiz) throw new Error("Missing quiz");
    isolatedQuizzes.push(quiz.id);
    await sql`update public.questions set quiz_id = ${quiz.id}::uuid, ordinal = 1 where id = ${f.questionId}::uuid`;
    await sql`update public.sessions set quiz_id = ${quiz.id}::uuid where id = ${f.sessionId}::uuid`;
    await sql`delete from public.participant_question_progress where session_id = ${f.sessionId}::uuid`;
    expect((await state(f)).question).toMatchObject({
      type: "content",
      status: "revealed",
      timeLimitEnabled: false,
      deadlineAt: null,
    });
    expect((await answer(f, { selectedIds: ["a"] })).status).toBe(409);
    const { POST } = await import("@/app/api/participant/[pin]/next/route");
    const response = await POST(
      new Request("http://localhost/next", { method: "POST" }) as Parameters<
        typeof POST
      >[0],
      { params: Promise.resolve({ pin: f.pin }) },
    );
    expect(await response.json()).toEqual({ status: "completed" });
    expect(await state(f)).toMatchObject({
      session: { participantStatus: "completed", status: "live" },
      question: null,
    });
    const [count] =
      await sql`select count(*)::integer as count from public.answers where session_id = ${f.sessionId}::uuid`;
    expect(count?.count).toBe(0);
  });
  it("includes an open async game in admin results without ending it", async () => {
    const f = await fixture("single", { timeLimitEnabled: false });
    await answer(f, { selectedIds: ["a"] });
    claims = { userId: SEED_ADMIN_ID, role: "admin" };
    const { GET } = await import("@/app/api/admin/results/route");
    let result: { id: string; status: string; gameMode: string } | undefined;
    let offset: number | null = 0;
    while (offset !== null && !result) {
      const response = await GET(
        new Request(`http://localhost/api/admin/results?offset=${offset}`),
      );
      const body = await response.json();
      result = body.sessions.find(
        (row: { id: string }) => row.id === f.sessionId,
      );
      offset = body.nextOffset;
    }
    expect(result).toMatchObject({ status: "live", gameMode: "async" });
  });
  it("rejects stale location readings and records an admin override without requiring device GPS", async () => {
    const f = await fixture("single", {
      locationGate: { lat: 31.5, lng: 34.9, radiusM: 100 },
    });
    await sql`update public.participant_question_progress set started_at = null where session_id = ${f.sessionId}::uuid`;
    const [stale] =
      await sql`select public.unlock_quiz_station(${f.sessionId}::uuid, ${f.participantId}::uuid, ${f.questionId}::uuid, 31.5, 34.9, 5, now() - interval '1 minute') as result`;
    expect(stale?.result).toBe("location_inaccurate");
    const { POST } = await import("@/app/api/admin/sessions/[id]/unlock/route");
    const request = () =>
      new Request("http://localhost/unlock", {
        method: "POST",
        body: JSON.stringify({
          participantId: f.participantId,
          questionId: f.questionId,
        }),
      });
    expect(
      (await POST(request(), { params: Promise.resolve({ id: f.sessionId }) }))
        .status,
    ).toBe(401);
    claims = { userId: SEED_ADMIN_ID, role: "admin" };
    expect(
      (await POST(request(), { params: Promise.resolve({ id: f.sessionId }) }))
        .status,
    ).toBe(200);
    const [row] =
      await sql`select location_unlock_actor, started_at from public.participant_question_progress where session_id = ${f.sessionId}::uuid`;
    expect(row?.location_unlock_actor).toBe(SEED_ADMIN_ID);
    expect(row?.started_at).not.toBeNull();
  });

  it("does not expose a gated station through the public cached question route", async () => {
    const f = await fixture("single", {
      locationGate: { lat: 31.5, lng: 34.9, radiusM: 100 },
    });
    const [question] =
      await sql`select ordinal from public.questions where id = ${f.questionId}::uuid`;
    const { GET } = await import("@/app/api/quiz/[pin]/question/[qIdx]/route");
    const response = await GET(
      new Request("http://localhost/question") as Parameters<typeof GET>[0],
      {
        params: Promise.resolve({
          pin: f.pin,
          qIdx: String(question?.ordinal),
        }),
      },
    );
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("Test prompt");
  });

  it("a retried advance from a content station does not skip the following content station", async () => {
    const f = await fixture("content");
    const [quiz] =
      await sql`insert into public.quizzes(owner_id,brand_id,title,default_game_mode)
      select owner_id,brand_id,'Retry test','async' from public.quizzes where id = ${SEED_QUIZ_ID}::uuid returning id`;
    if (!quiz) throw new Error("Missing quiz");
    isolatedQuizzes.push(quiz.id);
    await sql`update public.questions set quiz_id = ${quiz.id}::uuid, ordinal = 1 where id = ${f.questionId}::uuid`;
    await sql`insert into public.questions(quiz_id, ordinal, type, prompt) values (${quiz.id}::uuid, 2, 'content', 'Second info'), (${quiz.id}::uuid, 3, 'content', 'Third info')`;
    await sql`update public.sessions set quiz_id = ${quiz.id}::uuid where id = ${f.sessionId}::uuid`;
    await sql`delete from public.participant_question_progress where session_id = ${f.sessionId}::uuid`;
    const states = await Promise.all([state(f), state(f)]);
    expect(states.every((body) => body.question?.id === f.questionId)).toBe(
      true,
    );
    const { POST } = await import("@/app/api/participant/[pin]/next/route");
    const request = () =>
      new Request("http://localhost/next", {
        method: "POST",
        body: JSON.stringify({ questionId: f.questionId }),
      }) as Parameters<typeof POST>[0];
    const first = await (
      await POST(request(), { params: Promise.resolve({ pin: f.pin }) })
    ).json();
    const retry = await (
      await POST(request(), { params: Promise.resolve({ pin: f.pin }) })
    ).json();
    expect(retry).toMatchObject({
      status: "advanced",
      questionId: first.questionId,
    });
    expect((await state(f)).question.prompt).toBe("Second info");
  });
});
