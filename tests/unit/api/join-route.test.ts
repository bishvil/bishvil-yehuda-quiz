import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

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
      createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      ),
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
    await sql`
      delete from auth.users
      where raw_app_meta_data->>'participant_id' = ${target.participantId}
        and id <> ${target.participantId}::uuid
    `;
    await cleanupFixtures(
      sql,
      target.sessionId,
      target.questionId,
      target.participantId,
    );
  }
  await sql.end();
});

async function callJoinPost(
  pin: string,
  phone: string,
): Promise<{ status: number; body: unknown }> {
  const { POST } = await import("@/app/api/session/[pin]/join/route");
  const request = new Request(`http://localhost:3000/api/session/${pin}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      firstName: "Retry",
      lastName: "Participant",
      phone,
    }),
  });

  const response = await POST(
    request as Parameters<typeof POST>[0],
    { params: Promise.resolve({ pin }) } as Parameters<typeof POST>[1],
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("POST /api/session/[pin]/join", () => {
  it("returns the existing participant for normalized duplicate phone joins", async () => {
    const fixtures = await seedSyncFixtures(sql, { gameMode: "async" });
    cleanupTargets.push(fixtures);

    await sql`
      update public.session_participants
      set phone = '+972501234567'
      where id = ${fixtures.participantId}::uuid
    `;

    const result = await callJoinPost(fixtures.pin, "0501234567");

    expect(result.status).toBe(200);
    const body = result.body as {
      participantId: string;
      sessionId: string;
      accessToken: string;
    };
    expect(body.participantId).toBe(fixtures.participantId);
    expect(body.sessionId).toBe(fixtures.sessionId);
    expect(body.accessToken.length).toBeGreaterThan(20);

    const [phoneCount] = await sql<{ count: string }[]>`
      select count(*)::text
      from public.session_participants
      where session_id = ${fixtures.sessionId}::uuid
        and phone = '+972501234567'
    `;
    expect(phoneCount?.count).toBe("1");
  });
});
