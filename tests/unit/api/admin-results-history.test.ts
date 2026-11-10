import { afterAll, describe, expect, it, vi } from "vitest";
import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
  seedAdditionalQuestion,
  SEED_ADMIN_ID,
  SEED_QUIZ_ID,
  SEED_HOST_ID,
} from "./test-db";
vi.mock("@/src/lib/auth/server-auth", async () => ({
  ...(await vi.importActual<typeof import("@/src/lib/auth/server-auth")>(
    "@/src/lib/auth/server-auth",
  )),
  requireRole: vi.fn(async () => ({
    ok: true,
    claims: { userId: SEED_ADMIN_ID, role: "admin" },
  })),
}));
const sql = getTestPostgres();
const fixtures: Awaited<ReturnType<typeof seedSyncFixtures>>[] = [];
const extraSessions: string[] = [];
const extraQuestions: string[] = [];
afterAll(async () => {
  for (const id of extraSessions)
    await sql`delete from public.sessions where id=${id}::uuid`;
  for (const f of fixtures)
    await cleanupFixtures(sql, f.sessionId, f.questionId, f.participantId);
  for (const id of extraQuestions)
    await sql`delete from public.questions where id=${id}::uuid`;
  await sql.end();
});
async function results(offset?: number) {
  const { GET } = await import("@/app/api/admin/results/route");
  return GET(
    new Request(
      `http://localhost/api/admin/results${offset === undefined ? "" : `?offset=${offset}`}`,
    ),
  );
}
describe("historical async results", () => {
  it("shows an old async session that kept its legacy scheduled status, including its saved score", async () => {
    const f = await seedSyncFixtures(sql, { gameMode: "async" });
    fixtures.push(f);
    await sql`update public.sessions set status='scheduled',created_at='2026-05-10T10:00:00Z',started_at=null where id=${f.sessionId}::uuid`;
    await sql`insert into public.answers(session_id,question_id,participant_id,selected_ids,is_correct,score,time_bonus,submitted_at) values(${f.sessionId}::uuid,${f.questionId}::uuid,${f.participantId}::uuid,array['a'],true,800,0,'2026-05-10T10:05:00Z')`;
    await sql`insert into public.participant_scores(session_id,participant_id,total_score,correct_count) values(${f.sessionId}::uuid,${f.participantId}::uuid,800,1)`;
    const response = await results();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.sessions.find((row: { id: string }) => row.id === f.sessionId),
    ).toMatchObject({
      id: f.sessionId,
      status: "scheduled",
      gameMode: "async",
      participantCount: 1,
      averageScore: 800,
      createdAt: "2026-05-10T10:00:00+00:00",
      topThree: [{ participantId: f.participantId, score: 800 }],
    });
    const [stored] =
      await sql`select status,started_at from public.sessions where id=${f.sessionId}::uuid`;
    expect(stored).toMatchObject({ status: "scheduled", started_at: null });
  });
  it.each([
    ["scheduled", "sync", false],
    ["live", "sync", false],
    ["draft", "async", false],
    ["live", "async", true],
    ["paused", "async", true],
    ["ended", "sync", true],
    ["ended", "async", true],
  ] as const)(
    "preserves visibility for %s %s sessions",
    async (status, gameMode, visible) => {
      const f = await seedSyncFixtures(sql, { gameMode });
      fixtures.push(f);
      await sql`update public.sessions set status=${status}::public.session_status where id=${f.sessionId}::uuid`;
      const body = await (await results()).json();
      expect(
        body.sessions.some((row: { id: string }) => row.id === f.sessionId),
      ).toBe(visible);
    },
  );
  it("dates reused games by their latest saved answer rather than May lifecycle or score-cache repair", async () => {
    const f = await seedSyncFixtures(sql, { gameMode: "async" });
    fixtures.push(f);
    const extra = await seedAdditionalQuestion(sql);
    extraQuestions.push(extra.questionId);
    await sql`update public.sessions set created_at='2026-05-17T09:10:00Z',started_at='2026-05-17T09:10:00Z' where id=${f.sessionId}::uuid`;
    await sql`update public.session_participants set joined_at='2026-11-08T09:00:00Z' where id=${f.participantId}::uuid`;
    await sql`insert into public.answers(session_id,question_id,participant_id,selected_ids,is_correct,score,time_bonus,submitted_at) values
      (${f.sessionId}::uuid,${f.questionId}::uuid,${f.participantId}::uuid,array['a'],true,800,0,'2026-05-17T09:20:00Z'),
      (${f.sessionId}::uuid,${extra.questionId}::uuid,${f.participantId}::uuid,array['a'],true,800,0,'2026-11-08T10:05:00Z')`;
    await sql`insert into public.participant_question_progress(session_id,participant_id,question_id,question_index,status,started_at) values
      (${f.sessionId}::uuid,${f.participantId}::uuid,${f.questionId}::uuid,1,'answering',null),
      (${f.sessionId}::uuid,${f.participantId}::uuid,${extra.questionId}::uuid,2,'revealed','2026-11-08T10:00:00Z')`;
    await sql`insert into public.participant_scores(session_id,participant_id,total_score,correct_count,last_updated_at) values(${f.sessionId}::uuid,${f.participantId}::uuid,1600,2,'2026-11-10T10:00:00Z')`;
    const body = await (await results()).json();
    expect(
      body.sessions.find((row: { id: string }) => row.id === f.sessionId),
    ).toMatchObject({
      lastPlayedAt: "2026-11-08T10:05:00+00:00",
      lastJoinedAt: "2026-11-08T09:00:00+00:00",
      createdAt: "2026-05-17T09:10:00+00:00",
      averageScore: 1600,
    });
  });
  it("uses an actual question opening for information or unanswered play without inventing answers", async () => {
    const f = await seedSyncFixtures(sql, { gameMode: "async" });
    fixtures.push(f);
    await sql`insert into public.participant_question_progress(session_id,participant_id,question_id,question_index,status,started_at) values(${f.sessionId}::uuid,${f.participantId}::uuid,${f.questionId}::uuid,1,'revealed','2026-11-08T10:20:00Z')`;
    const body = await (await results()).json();
    expect(
      body.sessions.find((row: { id: string }) => row.id === f.sessionId),
    ).toMatchObject({ lastPlayedAt: "2026-11-08T10:20:00+00:00" });
    const [stored] =
      await sql`select count(*)::integer as count from public.answers where session_id=${f.sessionId}::uuid`;
    expect(stored?.count).toBe(0);
  });
  it("keeps sessions with no played activity and limits related timestamps independently per session", async () => {
    const a = await seedSyncFixtures(sql, { gameMode: "async" }),
      b = await seedSyncFixtures(sql, { gameMode: "async" });
    fixtures.push(a, b);
    await sql`update public.session_participants set joined_at='2026-11-08T10:00:00Z' where id=${a.participantId}::uuid`;
    await sql`update public.session_participants set joined_at='2026-11-09T10:00:00Z' where id=${b.participantId}::uuid`;
    const body = await (await results()).json();
    expect(
      body.sessions.find((row: { id: string }) => row.id === a.sessionId),
    ).toMatchObject({
      lastPlayedAt: null,
      lastJoinedAt: "2026-11-08T10:00:00+00:00",
    });
    expect(
      body.sessions.find((row: { id: string }) => row.id === b.sessionId),
    ).toMatchObject({
      lastPlayedAt: null,
      lastJoinedAt: "2026-11-09T10:00:00+00:00",
    });
  });
  it("makes records older than the first 50 reports reachable through pagination", async () => {
    const ids = Array.from({ length: 55 }, () => crypto.randomUUID());
    extraSessions.push(...ids);
    // One stable group of newest records makes pagination independent of other test files.
    for (const [index, id] of ids.entries())
      await sql`insert into public.sessions(id,quiz_id,host_id,pin,status,game_mode,created_at) values(${id}::uuid,${SEED_QUIZ_ID}::uuid,${SEED_HOST_ID}::uuid,${String(700000 + index)},'ended','async',${new Date(Date.UTC(2099, 0, 1, 0, index))})`;
    const first = await (await results()).json();
    expect(first.sessions).toHaveLength(50);
    expect(first.nextOffset).toBe(50);
    const second = await (await results(first.nextOffset)).json();
    const firstIds = first.sessions.map((row: { id: string }) => row.id);
    const secondIds = second.sessions.map((row: { id: string }) => row.id);
    expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    expect([...firstIds, ...secondIds]).toEqual(expect.arrayContaining(ids));
  });
  it("rejects invalid page offsets instead of dropping older records silently", async () => {
    const { GET } = await import("@/app/api/admin/results/route");
    for (const offset of ["-1", "1.5", "nope"]) {
      const response = await GET(
        new Request(`http://localhost/api/admin/results?offset=${offset}`),
      );
      expect(response.status).toBe(400);
    }
  });
});
