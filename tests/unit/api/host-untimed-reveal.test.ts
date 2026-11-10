import { afterAll, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestPostgres,
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
const fixtures: Awaited<ReturnType<typeof seedSyncFixtures>>[] = [];
afterAll(async () => {
  for (const f of fixtures)
    await cleanupFixtures(sql, f.sessionId, f.questionId, f.participantId);
  await sql.end();
});
async function setup(timed = false, content = false) {
  const f = await seedSyncFixtures(sql);
  fixtures.push(f);
  await sql`update public.questions set settings = ${sql.json({ timeLimitEnabled: timed })}, type = ${content ? "content" : "single"}::public.question_type where id = ${f.questionId}::uuid`;
  await sql`update public.sessions set current_question_id = ${f.questionId}::uuid where id = ${f.sessionId}::uuid`;
  await sql`insert into public.question_session_state(session_id,question_id,question_index,status,started_at,deadline_at) values (${f.sessionId}::uuid,${f.questionId}::uuid,1,'answering',now(),${timed ? new Date(Date.now() + 60000) : null})`;
  return f;
}
async function reveal(f: Awaited<ReturnType<typeof setup>>) {
  const { POST } = await import("@/app/api/host/[pin]/question/reveal/route");
  const response = await POST(
    new Request("http://localhost/reveal", {
      method: "POST",
      body: JSON.stringify({ questionId: f.questionId }),
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin: f.pin }) },
  );
  return { status: response.status, body: await response.json() };
}
describe("host closing untimed stations", () => {
  it("closes with unanswered participants, is idempotent, and rejects subsequent answers", async () => {
    const f = await setup();
    expect(await reveal(f)).toMatchObject({
      status: 200,
      body: { status: "revealed" },
    });
    expect((await reveal(f)).status).toBe(200);
    const [answer] =
      await sql`select result_status from public.submit_answer(${f.sessionId}::uuid,${f.participantId}::uuid,${f.questionId}::uuid,array['a'])`;
    expect(answer?.result_status).toBe("late_submission");
  });
  it("does not allow early reveal of a timed question", async () => {
    const f = await setup(true);
    expect((await reveal(f)).status).toBe(409);
  });
  it("does not reveal while paused", async () => {
    const f = await setup();
    await sql`update public.sessions set status = 'paused' where id = ${f.sessionId}::uuid`;
    expect((await reveal(f)).status).toBe(409);
  });
  it("lets a host close an informational station without requiring answers", async () => {
    const f = await setup(false, true);
    expect((await reveal(f)).status).toBe(200);
  });
});
