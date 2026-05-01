import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
} from "./test-db";
import type { Database } from "@/src/lib/supabase/database.types";

vi.mock("@/src/lib/supabase/server", async () => {
  const actual = await vi.importActual<
    typeof import("@/src/lib/supabase/server")
  >("@/src/lib/supabase/server");
  return {
    ...actual,
    createServerSupabaseClient: async () =>
      createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }),
  };
});

const sql = getTestPostgres();
const cleanupTargets: Array<{
  sessionId: string;
  questionId: string;
  participantId: string;
}> = [];

afterAll(async () => {
  for (const target of cleanupTargets) {
    await cleanupFixtures(
      sql,
      target.sessionId,
      target.questionId,
      target.participantId,
    );
  }
  await sql.end();
});

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "<redacted-local-anon-jwt>";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "<redacted-local-service-role-jwt>";
const SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ??
  "super-secret-jwt-token-with-at-least-32-characters-long";

function makeTokenClient(accessToken: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

function makeServiceClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function joinWithRoute(phoneSuffix: string) {
  const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });

  await sql`
    update public.sessions
    set status = 'live'
    where id = ${fixtures.sessionId}::uuid
  `;
  await sql`
    delete from public.session_participants
    where id = ${fixtures.participantId}::uuid
  `;
  await sql`delete from auth.users where id = ${fixtures.participantId}::uuid`;

  const { POST } = await import("@/app/api/session/[pin]/join/route");
  const response = await POST(
    new Request(`http://localhost:3000/api/session/${fixtures.pin}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Rls",
        lastName: "Participant",
        phone: `0501234${phoneSuffix}`,
      }),
    }) as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin: fixtures.pin }) } as Parameters<typeof POST>[1],
  );

  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    participantId: string;
    sessionId: string;
    accessToken: string;
  };

  cleanupTargets.push({
    sessionId: fixtures.sessionId,
    questionId: fixtures.questionId,
    participantId: body.participantId,
  });

  return { ...fixtures, participantId: body.participantId, accessToken: body.accessToken };
}

async function insertProgressAsService(args: {
  sessionId: string;
  participantId: string;
  questionId: string;
}) {
  const service = makeServiceClient();
  const { error } = await service.from("participant_question_progress").insert({
    session_id: args.sessionId,
    participant_id: args.participantId,
    question_id: args.questionId,
    question_index: 1,
    status: "answering",
    started_at: new Date().toISOString(),
    deadline_at: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(error).toBeNull();
}

async function expiredParticipantToken(args: {
  participantId: string;
  sessionId: string;
}) {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: args.participantId,
    iat: now - 120,
    exp: now - 60,
    app_metadata: {
      role: "participant",
      session_id: args.sessionId,
      participant_id: args.participantId,
    },
  };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", SUPABASE_JWT_SECRET)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

describe("RLS policies (ADR-0008 §Consequences)", () => {
  it("allows own progress read/write with the join-issued scoped participant token", async () => {
    const participant = await joinWithRoute("001");
    const client = makeTokenClient(participant.accessToken);

    const { error: insertError } = await client
      .from("participant_question_progress")
      .insert({
        session_id: participant.sessionId,
        participant_id: participant.participantId,
        question_id: participant.questionId,
        question_index: 1,
        status: "answering",
        started_at: new Date().toISOString(),
        deadline_at: new Date(Date.now() + 60_000).toISOString(),
      });

    expect(insertError).toBeNull();

    const { data, error: readError } = await client
      .from("participant_question_progress")
      .select("session_id, participant_id, question_id")
      .eq("participant_id", participant.participantId);

    expect(readError).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      session_id: participant.sessionId,
      participant_id: participant.participantId,
      question_id: participant.questionId,
    });
  });

  it("denies sibling progress read/write with another participant token", async () => {
    const participantA = await joinWithRoute("002");
    const participantB = await joinWithRoute("003");
    await insertProgressAsService({
      sessionId: participantB.sessionId,
      participantId: participantB.participantId,
      questionId: participantB.questionId,
    });

    const clientA = makeTokenClient(participantA.accessToken);
    const { data, error: readError } = await clientA
      .from("participant_question_progress")
      .select("session_id, participant_id")
      .eq("participant_id", participantB.participantId);

    expect(readError).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { error: insertError } = await clientA
      .from("participant_question_progress")
      .insert({
        session_id: participantB.sessionId,
        participant_id: participantB.participantId,
        question_id: participantB.questionId,
        question_index: 1,
        status: "answering",
        started_at: new Date().toISOString(),
        deadline_at: new Date(Date.now() + 60_000).toISOString(),
      });

    expect(insertError).not.toBeNull();
  });

  it("denies a token scoped to one session from writing progress in another session", async () => {
    const participantA = await joinWithRoute("004");
    const participantB = await joinWithRoute("005");
    const clientA = makeTokenClient(participantA.accessToken);

    const { error } = await clientA.from("participant_question_progress").insert({
      session_id: participantB.sessionId,
      participant_id: participantA.participantId,
      question_id: participantB.questionId,
      question_index: 1,
      status: "answering",
      started_at: new Date().toISOString(),
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it("denies expired participant tokens", async () => {
    const participant = await joinWithRoute("006");
    await insertProgressAsService({
      sessionId: participant.sessionId,
      participantId: participant.participantId,
      questionId: participant.questionId,
    });
    const expiredToken = await expiredParticipantToken({
      participantId: participant.participantId,
      sessionId: participant.sessionId,
    });
    const client = makeTokenClient(expiredToken);

    const { data, error } = await client
      .from("participant_question_progress")
      .select("session_id, participant_id")
      .eq("participant_id", participant.participantId);

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
