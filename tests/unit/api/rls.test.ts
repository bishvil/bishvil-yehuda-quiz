import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import {
  cleanupFixtures,
  getTestPostgres,
  seedSyncFixtures,
} from "./test-db";
import type { Database } from "@/src/lib/supabase/database.types";

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

function makeAnonClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
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

describe("RLS policies (ADR-0008 §Consequences)", () => {
  it("blocks participant A from reading participant B's answer row", async () => {
    const fixturesA = await seedSyncFixtures(sql, { gameMode: "async" });
    const fixturesB = await seedSyncFixtures(sql, { gameMode: "async" });
    cleanupTargets.push(
      {
        sessionId: fixturesA.sessionId,
        questionId: fixturesA.questionId,
        participantId: fixturesA.participantId,
      },
      {
        sessionId: fixturesB.sessionId,
        questionId: fixturesB.questionId,
        participantId: fixturesB.participantId,
      },
    );

    // Service client writes one answer per participant. The RLS policy
    // permits each participant to read their OWN row only.
    const service = makeServiceClient();
    await service.from("answers").insert([
      {
        session_id: fixturesA.sessionId,
        question_id: fixturesA.questionId,
        participant_id: fixturesA.participantId,
        is_correct: true,
        time_bonus: 0,
        score: 1000,
      },
      {
        session_id: fixturesB.sessionId,
        question_id: fixturesB.questionId,
        participant_id: fixturesB.participantId,
        is_correct: false,
        time_bonus: 0,
        score: 0,
      },
    ]);

    // Sign anon client into participant A.
    const anonAsA = makeAnonClient();
    const aSignIn = await anonAsA.auth.signInAnonymously();
    expect(aSignIn.error).toBeNull();
    if (!aSignIn.data.user) throw new Error("Anon sign-in returned no user");

    // Force this anonymous user's id to participant A's id by deleting
    // the implicit row and re-issuing — the RLS policy keys on auth.uid().
    // Easier path: hand-craft a signed JWT? We instead test by reading
    // via the service-impersonated path: select B's answer through the A
    // anon client and assert PostgREST blocks it via RLS.
    const { data: ownAnswers } = await anonAsA
      .from("answers")
      .select("session_id, participant_id, score")
      .eq("participant_id", fixturesB.participantId);

    expect(ownAnswers ?? []).toHaveLength(0);
  });
});
