import { afterAll, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestPostgres,
  seedAdditionalQuestion,
  seedSyncFixtures,
} from "./test-db";
let claims: { userId: string; role: "participant"; sessionId: string } | null =
  null;
vi.mock("@/src/lib/auth/server-auth", async () => ({
  ...(await vi.importActual<typeof import("@/src/lib/auth/server-auth")>(
    "@/src/lib/auth/server-auth",
  )),
  requireRole: vi.fn(async () =>
    claims
      ? { ok: true, claims }
      : { ok: false, response: new Response(null, { status: 401 }) },
  ),
}));
const sql = getTestPostgres();
const fixtures: Awaited<ReturnType<typeof seedSyncFixtures>>[] = [];
const additional: string[] = [];
afterAll(async () => {
  for (const f of fixtures)
    await cleanupFixtures(sql, f.sessionId, f.questionId, f.participantId);
  for (const id of additional)
    await sql`delete from public.questions where id = ${id}::uuid`;
  await sql.end();
});
async function fixture(gameMode: "sync" | "async" = "async") {
  const f = await seedSyncFixtures(sql, { gameMode });
  fixtures.push(f);
  claims = {
    userId: f.participantId,
    role: "participant",
    sessionId: f.sessionId,
  };
  await sql`update public.questions set type = 'open', settings = '{"timeLimitEnabled":false,"acceptedAnswers":["SECRET_EXPECTED"]}'::jsonb where id = ${f.questionId}::uuid`;
  if (gameMode === "async")
    await sql`insert into public.participant_question_progress(session_id,participant_id,question_id,question_index,status,started_at) select ${f.sessionId}::uuid,${f.participantId}::uuid,id,ordinal,'answering',now() from public.questions where id = ${f.questionId}::uuid`;
  else
    await sql`insert into public.question_session_state(session_id,question_id,question_index,status,started_at) select ${f.sessionId}::uuid,id,ordinal,'answering',now() from public.questions where id=${f.questionId}::uuid`;
  return f;
}
async function review(pin: string) {
  const { GET } = await import("@/app/api/participant/[pin]/review/route");
  const response = await GET(new Request("http://localhost/review"), {
    params: Promise.resolve({ pin }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => null),
  };
}
async function state(pin: string) {
  const { GET } = await import("@/app/api/participant/[pin]/state/route");
  return (
    await GET(
      new Request("http://localhost/state") as Parameters<typeof GET>[0],
      { params: Promise.resolve({ pin }) },
    )
  ).json();
}

describe("personal review authorization and reveal boundaries", () => {
  it("rejects unauthenticated, mismatched-session and unfinished access", async () => {
    const f = await fixture();
    expect(await review(f.pin)).toMatchObject({
      status: 409,
      body: { error: "PARTICIPANT_NOT_FINISHED" },
    });
    claims = { ...claims!, sessionId: "00000000-0000-4000-8000-000000000000" };
    expect((await review(f.pin)).status).toBe(403);
    claims = null;
    expect((await review(f.pin)).status).toBe(401);
  });

  it("requires an actual participant in the claimed session", async () => {
    const f = await fixture();
    claims = { ...claims!, userId: "00000000-0000-4000-8000-000000000000" };
    expect(await review(f.pin)).toMatchObject({
      status: 403,
      body: { error: "PARTICIPANT_NOT_FOUND" },
    });
  });

  it("reviews only own revealed history, including missed questions; future prompts and settings remain private", async () => {
    const f = await fixture();
    const future = await seedAdditionalQuestion(sql);
    additional.push(future.questionId);
    await sql`update public.questions set prompt = 'FUTURE_PRIVATE_PROMPT', settings = '{"acceptedAnswers":["FUTURE_PRIVATE_EXPECTED"]}'::jsonb where id = ${future.questionId}::uuid`;
    await sql`update public.participant_question_progress set status='revealed',revealed_at=now() where session_id=${f.sessionId}::uuid`;
    await sql`update public.session_participants set status='completed' where id=${f.participantId}::uuid`;
    const response = await review(f.pin);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.body.review).toHaveLength(1);
    expect(response.body.review[0]).toMatchObject({
      questionId: f.questionId,
      outcome: "missed",
      correctAnswer: "SECRET_EXPECTED",
      submittedAnswer: null,
    });
    expect(JSON.stringify(response.body)).not.toContain("FUTURE_PRIVATE");
    expect(JSON.stringify(response.body)).not.toContain("acceptedAnswers");
  });

  it("never mixes another participant's submitted answer into the review", async () => {
    const f = await fixture();
    const other = await fixture();
    await sql`update public.session_participants set session_id=${f.sessionId}::uuid where id=${other.participantId}::uuid`;
    await sql`insert into public.answers(session_id,question_id,participant_id,text_answer,is_correct,score,time_bonus) values
      (${f.sessionId}::uuid,${f.questionId}::uuid,${f.participantId}::uuid,'OWN_PRIVATE_TEXT',false,0,0),
      (${f.sessionId}::uuid,${f.questionId}::uuid,${other.participantId}::uuid,'OTHER_PRIVATE_TEXT',false,0,0)`;
    await sql`update public.participant_question_progress set status='revealed' where session_id=${f.sessionId}::uuid`;
    await sql`update public.session_participants set status='completed' where id=${f.participantId}::uuid`;
    claims = {
      userId: f.participantId,
      sessionId: f.sessionId,
      role: "participant",
    };
    const response = await review(f.pin);
    expect(response.body.review[0].submittedAnswer).toBe("OWN_PRIVATE_TEXT");
    expect(JSON.stringify(response.body)).not.toContain("OTHER_PRIVATE_TEXT");
  });

  it("does not reveal submitted open answers before sync reveal, and reveals accepted text afterwards", async () => {
    const f = await fixture("sync");
    // Sync state is selected through the active question pointer.
    await sql`update public.sessions set current_question_id=${f.questionId}::uuid where id=${f.sessionId}::uuid`;
    const before = await state(f.pin);
    expect(JSON.stringify(before)).not.toContain("SECRET_EXPECTED");
    expect(before.reveal).toBeNull();
    await sql`update public.question_session_state set status='revealed',revealed_at=now() where session_id=${f.sessionId}::uuid`;
    const after = await state(f.pin);
    expect(after.reveal.acceptedAnswer).toBe("SECRET_EXPECTED");
    await sql`update public.sessions set status='ended' where id=${f.sessionId}::uuid`;
    expect((await review(f.pin)).body.review[0]).toMatchObject({
      outcome: "missed",
      correctAnswer: "SECRET_EXPECTED",
    });
  });

  it("keeps async submit and public payloads free of accepted-answer settings and returns them only in revealed state", async () => {
    const f = await fixture();
    expect(JSON.stringify(await state(f.pin))).not.toContain("SECRET_EXPECTED");
    const [question] =
      await sql`select ordinal from public.questions where id=${f.questionId}::uuid`;
    const { GET: publicQuestion } =
      await import("@/app/api/quiz/[pin]/question/[qIdx]/route");
    const publicResponse = await publicQuestion(
      new Request("http://localhost/question") as Parameters<
        typeof publicQuestion
      >[0],
      {
        params: Promise.resolve({
          pin: f.pin,
          qIdx: String(question?.ordinal),
        }),
      },
    );
    expect(publicResponse.status).toBe(200);
    expect(JSON.stringify(await publicResponse.json())).not.toContain(
      "SECRET_EXPECTED",
    );
    const { POST } = await import("@/app/api/session/[pin]/answer/route");
    const response = await POST(
      new Request(`http://localhost/api/session/${f.pin}/answer`, {
        method: "POST",
        body: JSON.stringify({ questionId: f.questionId, textAnswer: "Wrong" }),
      }) as Parameters<typeof POST>[0],
      { params: Promise.resolve({ pin: f.pin }) },
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(
      "SECRET_EXPECTED",
    );
    expect((await state(f.pin)).reveal.acceptedAnswer).toBe("SECRET_EXPECTED");
  });
});
